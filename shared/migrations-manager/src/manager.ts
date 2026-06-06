import fs from 'node:fs/promises';
import path from 'node:path';
import { buildRequiredPackages } from './build.js';
import { compareCatalogs, createMigrationCatalog, selectMigrations, sha256File } from './catalog.js';
import { labelsForManifest } from './labels.js';
import { MysqlImageDatabase } from './mysql-image-database.js';
import { createCliContainerRuntime, runCommand } from './runtime.js';
import { MigrationTimer } from './timings.js';
import type { BaseImageOptions, BaseImageResult, MigrationChainResult, MigrationExecutionResult, MigrationImageManifest, MigrationTimings, RunMigrationChainOptions, StaleMigrationOutput } from './types.js';

const defaultMysqlImage = 'docker.io/library/mysql:8.4';

export async function createBaseImage(options: BaseImageOptions): Promise<BaseImageResult> {
    const rootDir = options.rootDir ?? process.cwd();
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const timer = new MigrationTimer();
    const mysqlImage = options.mysqlImage ?? defaultMysqlImage;
    const telemetry = options.telemetry ?? true;
    const chainId = options.chainId ?? createChainId();
    const dump = options.dump ? expandHome(options.dump) : undefined;
    const dumpSha256Promise = dump ? sha256File(dump).catch(() => 'unknown') : Promise.resolve(undefined);
    const catalog = await createMigrationCatalog(rootDir);
    const database = new MysqlImageDatabase(runtime, options.verbose ?? false);
    const container = safeContainerName(`stamhoofd-migrations-base-${chainId}`);
    const startedAt = new Date().toISOString();
    await measureBasePhase(options, timer, 'assert-image-missing', 'Checking image name', { image: options.tag }, () => assertImageMissing(runtime, options.tag));

    try {
        await measureBasePhase(options, timer, 'start-container', 'Starting MySQL', { image: mysqlImage, container, publishPort: false }, () => database.start(mysqlImage, container, { tuning: options.mysqlTuning }));
        await measureBasePhase(options, timer, 'create-database', 'Creating database', { container, database: options.database }, () => database.createDatabase(container, options.database));
        if (dump) {
            await measureBasePhase(options, timer, 'import-dump', 'Importing database dump', { container, database: options.database, dump }, async () => {
                if (options.mysqlTuning?.unsafe) {
                    await database.disableRedoLog(container);
                }
                await database.importDump(container, dump, options.database, {
                    gpgHome: options.dumpGpgHome,
                    onProgress: progress => options.onProgress?.({ type: 'import:progress', ...progress }),
                });
                if (options.mysqlTuning?.unsafe) {
                    await database.enableRedoLog(container);
                }
            });
        } else {
            timer.skipped('import-dump', { container, database: options.database });
        }
        const baseProgress = await measureBasePhase(options, timer, 'detect-applied-migrations', 'Detecting applied migrations', { container, database: options.database }, async () => {
            const executed = await database.listExecutedMigrations(container, options.database);
            return detectBaseMigrationProgress(catalog, executed);
        });
        await measureBasePhase(options, timer, 'prepare-metadata', 'Writing metadata', { container }, () => Promise.resolve());
        const dumpSha256 = await dumpSha256Promise;
        const finishedAt = new Date().toISOString();
        const manifest: MigrationImageManifest = {
            version: 1,
            chainId,
            role: 'base',
            status: 'base',
            database: options.database,
            image: options.tag,
            displayName: options.displayName,
            dumpSha256,
            emptyBase: !dump,
            startedAt,
            finishedAt,
            runtime: runtime.command,
            mysqlImage,
            catalog,
            baseMigrationCount: baseProgress.count,
            baseMigrationTotal: catalog.entries.length,
            baseLastMigration: baseProgress.last?.normalizedFile,
            baseLastMigrationIndex: baseProgress.last?.index,
            timings: telemetry ? timer.snapshot() : undefined,
        };
        await database.writeManifest(container, manifest);
        await measureBasePhase(options, timer, 'stop-mysql', 'Stopping MySQL', { container }, () => database.stopForCommit(container));
        const imageId = await measureBasePhase(options, timer, 'commit-image', 'Committing image', { container }, () => runtime.commit(container, options.tag, { labels: labelsForManifest(manifest) }));
        options.onProgress?.({ type: 'done', image: options.tag, imageId });
        return { chainId, image: options.tag, imageId, dumpSha256, manifest };
    } finally {
        await runtime.remove(container);
    }
}

async function measureBasePhase<T>(options: BaseImageOptions, timer: MigrationTimer, phase: string, message: string, data: Record<string, string | number | boolean | null> | undefined, run: () => Promise<T>): Promise<T> {
    options.onProgress?.({ type: 'phase:start', phase, message });
    const result = await timer.measure(phase, data, run);
    options.onProgress?.({ type: 'phase:finish', phase, message });
    return result;
}

export async function runMigrationChain(options: RunMigrationChainOptions): Promise<MigrationChainResult> {
    const rootDir = options.rootDir ?? process.cwd();
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const chainId = options.chainId ?? createChainId();
    const build = options.build ?? 'auto';
    const allowChangedFiles = options.allowChangedFiles ?? false;
    const continueOnFailure = options.continueOnFailure ?? false;
    const telemetry = options.telemetry ?? true;
    await buildRequiredPackages(rootDir, build, options.verbose ?? false);

    const catalog = options.catalog ?? await createMigrationCatalog(rootDir);
    const changedFiles = options.previousCatalog ? compareCatalogs(options.previousCatalog, catalog) : [];
    if (changedFiles.length > 0 && !allowChangedFiles) {
        throw new Error(`Migration files changed since the previous chain: ${changedFiles.map(file => file.normalizedFile).join(', ')}`);
    }

    const baseProgress = await readBaseMigrationProgress(runtime, options.baseImage);
    const startFrom = options.startFrom ?? startFromBaseProgress(catalog, baseProgress);
    const selectedMigrations = !options.startFrom && baseProgress.completed >= catalog.entries.length
        ? []
        : selectMigrations(catalog, startFrom);
    const migrations = options.limit === undefined ? selectedMigrations : selectedMigrations.slice(0, options.limit);
    const database = new MysqlImageDatabase(runtime, options.verbose ?? false);
    const results: MigrationExecutionResult[] = [];
    const timingResults: Array<{ migration: string; image: string; status: 'success' | 'failed'; timer: MigrationTimer }> = [];
    const cleanupPromises: Promise<void>[] = [];
    const chainTimer = new MigrationTimer();
    let parentImage = options.baseImage;
    const previousChainId = options.previousChainId ?? baseProgress.chainId;

    options.onProgress?.({ type: 'start', chainId, total: migrations.length });

    for (const migration of migrations) {
        const tag = `${options.tagPrefix}:${String(migration.index + 1).padStart(4, '0')}-${slug(migration.normalizedFile)}`;
        const container = safeContainerName(`stamhoofd-migrations-${chainId}-${migration.index}`);
        const startedAt = new Date().toISOString();
        let status: 'success' | 'failed' = 'success';
        let log = '';
        let error: string | undefined;
        const timer = new MigrationTimer();
        options.onProgress?.({ type: 'migration:start', chainId, migration, completed: results.length, total: migrations.length });
        try {
            await measureMigrationPhase(options, timer, chainId, migration, results.length, migrations.length, 'assert-image-missing', 'Checking image name', { image: tag }, () => assertImageMissing(runtime, tag));
            await measureMigrationPhase(options, timer, chainId, migration, results.length, migrations.length, 'start-container', 'Starting MySQL', { image: parentImage, container, publishPort: true }, () => database.start(parentImage, container, { publishPort: true, tuning: options.mysqlTuning }));
            const port = await measureMigrationPhase(options, timer, chainId, migration, results.length, migrations.length, 'resolve-mapped-port', 'Resolving MySQL port', { container }, () => database.mappedPort(container));
            if (options.mysqlTuning?.unsafe) {
                await measureMigrationPhase(options, timer, chainId, migration, results.length, migrations.length, 'disable-redo-log', 'Disabling redo log', { container }, () => database.disableRedoLog(container));
            }
            const run = await measureMigrationPhase(options, timer, chainId, migration, results.length, migrations.length, 'run-migration', 'Running migration', { container, port, migration: migration.normalizedFile }, () => runCommand('node', ['--enable-source-maps', path.join(rootDir, 'backend/app/api/dist/single-migration.js'), '--file', compiledMigrationPath(rootDir, migration), '--name', migration.normalizedFile], {
                cwd: rootDir,
                allowFailure: true,
                env: {
                    ...process.env,
                    ...options.env,
                    DB_HOST: '127.0.0.1',
                    DB_PORT: port,
                    DB_DATABASE: options.database,
                    DB_USER: 'root',
                    DB_PASS: 'root',
                    MIGRATION_DB_HOST: '127.0.0.1',
                    MIGRATION_DB_PORT: port,
                    MIGRATION_DB_DATABASE: options.database,
                    MIGRATION_DB_USER: 'root',
                    MIGRATION_DB_PASS: 'root',
                    DB_MULTIPLE_STATEMENTS: 'true',
                    STAMHOOFD_ENV: options.env?.STAMHOOFD_ENV ?? process.env.STAMHOOFD_ENV ?? 'stamhoofd',
                },
                verbose: options.verbose,
            }));
            log = [run.stdout, run.stderr].filter(Boolean).join('\n');
            if (run.status !== 0) {
                status = 'failed';
                error = log.trim() || `Migration exited with status ${run.status}`;
            }
            if (status === 'success' && options.mysqlTuning?.unsafe) {
                await measureMigrationPhase(options, timer, chainId, migration, results.length, migrations.length, 'enable-redo-log', 'Enabling redo log', { container }, () => database.enableRedoLog(container));
            }
        } catch (e) {
            status = 'failed';
            error = e instanceof Error ? e.message : String(e);
            log = [log, error].filter(Boolean).join('\n');
        }

        await measureMigrationPhase(options, timer, chainId, migration, results.length, migrations.length, 'prepare-metadata', 'Preparing metadata', { container, logBytes: Buffer.byteLength(log) }, () => Promise.resolve());
        const finishedAt = new Date().toISOString();
        const manifest: MigrationImageManifest = {
            version: 1,
            chainId,
            role: 'migration',
            status,
            database: options.database,
            image: tag,
            parentImage,
            migration,
            catalog,
            changedFiles,
            previousCatalogHash: options.previousCatalog?.hash,
            startedAt,
            finishedAt,
            error,
            logPath: `/stamhoofd-migrations/logs/${migration.normalizedFile}.log`,
            runtime: runtime.command,
            mysqlImage: options.mysqlImage ?? defaultMysqlImage,
            previousChainId,
            timings: telemetry ? timer.snapshot() : undefined,
        };
        await measureMigrationPhase(options, timer, chainId, migration, results.length, migrations.length, 'write-manifest', 'Writing manifest', { container }, () => database.writeManifest(container, manifest, { [`${migration.normalizedFile}.log`]: log }));
        await measureMigrationPhase(options, timer, chainId, migration, results.length, migrations.length, 'stop-mysql', 'Stopping MySQL', { container }, () => database.stopForCommit(container));
        const preCommitTimings = timer.snapshot();
        const imageId = await measureMigrationPhase(options, timer, chainId, migration, results.length, migrations.length, 'commit-image', 'Committing image', { container, image: tag }, () => runtime.commit(container, tag, { labels: labelsForManifest(manifest, preCommitTimings) }));
        const cleanup = timer.measure('remove-container', { container }, () => runtime.remove(container));
        cleanupPromises.push(cleanup);

        results.push({ migration, status, image: tag, imageId, startedAt, finishedAt, log, error });
        options.onProgress?.({ type: 'migration:finish', chainId, result: results[results.length - 1], completed: results.length, total: migrations.length });
        parentImage = tag;
        timingResults.push({ migration: migration.normalizedFile, image: tag, status, timer });
        if (status === 'failed' && !continueOnFailure) {
            await cleanup;
            break;
        }
    }

    await Promise.all(cleanupPromises);
    options.onProgress?.({ type: 'done', chainId, completed: results.length, total: migrations.length });
    const migrationTimings = timingResults.map(result => ({ migration: result.migration, image: result.image, status: result.status, timings: result.timer.snapshot() }));
    const totals = phaseTotals(migrationTimings.map(result => result.timings));
    const measuredPhaseMs = totals.reduce((sum, phase) => sum + phase.totalMs, 0);
    const totalMs = chainTimer.totalMs();
    return { chainId, catalog, changedFiles, results, timings: { totalMs, measuredPhaseMs, unaccountedMs: Math.max(0, totalMs - measuredPhaseMs), migrations: migrationTimings, phaseTotals: totals } };
}

function phaseTotals(timings: MigrationTimings[]): NonNullable<MigrationChainResult['timings']>['phaseTotals'] {
    const totals = new Map<string, { totalMs: number; count: number }>();
    for (const timing of timings) {
        for (const phase of timing.phases) {
            const current = totals.get(phase.name) ?? { totalMs: 0, count: 0 };
            totals.set(phase.name, { totalMs: current.totalMs + phase.durationMs, count: current.count + 1 });
        }
    }
    return [...totals.entries()].map(([name, value]) => ({ name, totalMs: value.totalMs, count: value.count })).sort((a, b) => b.totalMs - a.totalMs);
}

async function measureMigrationPhase<T>(options: RunMigrationChainOptions, timer: MigrationTimer, chainId: string, migration: Awaited<ReturnType<typeof createMigrationCatalog>>['entries'][number], completed: number, total: number, phase: string, message: string, data: Record<string, string | number | boolean | null> | undefined, run: () => Promise<T>): Promise<T> {
    options.onProgress?.({ type: 'phase:start', chainId, migration, phase, message, completed, total });
    try {
        return await timer.measure(phase, data, run);
    } finally {
        options.onProgress?.({ type: 'phase:finish', chainId, migration, phase, message, completed, total });
    }
}

export async function detectStaleMigrationOutputs(rootDir = process.cwd()): Promise<StaleMigrationOutput[]> {
    const catalog = await createMigrationCatalog(rootDir);
    const stale: StaleMigrationOutput[] = [];
    for (const migration of catalog.entries) {
        if (!migration.sourcePath.endsWith('.ts')) {
            continue;
        }
        const compiledPath = compiledMigrationPath(rootDir, migration);
        const source = await fs.stat(migration.sourcePath);
        const compiled = await fs.stat(compiledPath).catch(() => undefined);
        if (!compiled) {
            stale.push({ normalizedFile: migration.normalizedFile, sourcePath: migration.sourcePath, compiledPath, status: 'missing' });
            continue;
        }
        if (compiled.mtimeMs < source.mtimeMs) {
            stale.push({ normalizedFile: migration.normalizedFile, sourcePath: migration.sourcePath, compiledPath, status: 'stale' });
        }
    }
    return stale;
}

function createChainId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeContainerName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+/, '').slice(0, 120);
}

function detectBaseMigrationProgress(catalog: Awaited<ReturnType<typeof createMigrationCatalog>>, executed: string[]): { count: number; last?: { index: number; normalizedFile: string } } {
    const executedSet = new Set(executed.map(file => file.replace(/\.ts$/, '.js')));
    const applied = catalog.entries.filter(entry => executedSet.has(entry.normalizedFile));
    const last = applied.at(-1);
    return { count: applied.length, last: last ? { index: last.index, normalizedFile: last.normalizedFile } : undefined };
}

async function readBaseMigrationProgress(runtime: { inspectImage(image: string): Promise<{ labels: Record<string, string> }> }, image: string): Promise<{ chainId?: string; completed: number }> {
    try {
        const metadata = await runtime.inspectImage(image);
        const role = metadata.labels['be.stamhoofd.migrations.role'];
        if (role !== 'base') {
            return { completed: 0 };
        }
        const lastIndex = Number(metadata.labels['be.stamhoofd.migrations.base-last-migration-index']);
        return {
            chainId: metadata.labels['be.stamhoofd.migrations.chain'],
            completed: Number.isFinite(lastIndex) ? lastIndex + 1 : Number(metadata.labels['be.stamhoofd.migrations.base-migration-count'] ?? 0),
        };
    } catch {
        return { completed: 0 };
    }
}

function startFromBaseProgress(catalog: Awaited<ReturnType<typeof createMigrationCatalog>>, progress: { completed: number }): string | undefined {
    if (progress.completed <= 0) {
        return undefined;
    }
    return catalog.entries[progress.completed]?.normalizedFile;
}

async function assertImageMissing(runtime: { inspectImage(image: string): Promise<unknown> }, image: string): Promise<void> {
    try {
        await runtime.inspectImage(image);
    } catch {
        return;
    }
    throw new Error(`Image already exists: ${image}`);
}

export function compiledMigrationPath(rootDir: string, migration: { sourcePath: string }): string {
    const relative = path.relative(rootDir, migration.sourcePath).replace(/\.ts$/, '.js');
    if (relative.startsWith('backend/app/api/src/')) {
        return path.join(rootDir, 'backend/app/api/dist/src', relative.slice('backend/app/api/src/'.length));
    }
    if (relative.startsWith('backend/shared/models/src/')) {
        return path.join(rootDir, 'backend/shared/models/dist', relative.slice('backend/shared/models/src/'.length));
    }
    return path.join(rootDir, relative.replace('/src/', '/dist/'));
}

function slug(file: string): string {
    return file.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_.-]+/g, '-');
}

function expandHome(file: string): string {
    if (file === '~') {
        return process.env.HOME ?? file;
    }
    if (file.startsWith('~/')) {
        return path.join(process.env.HOME ?? '', file.slice(2));
    }
    return file;
}
