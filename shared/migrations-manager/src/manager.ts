import fs from 'node:fs/promises';
import path from 'node:path';
import { buildRequiredPackages } from './build.js';
import { compareCatalogs, createMigrationCatalog, selectMigrations, sha256File } from './catalog.js';
import { labelsForManifest } from './labels.js';
import { MysqlImageDatabase } from './mysql-image-database.js';
import { createCliContainerRuntime, runCommand } from './runtime.js';
import { MigrationTimer } from './timings.js';
import type { BaseImageOptions, BaseImageResult, MigrationChainResult, MigrationExecutionResult, MigrationImageManifest, RunMigrationChainOptions, StaleMigrationOutput } from './types.js';

const defaultMysqlImage = 'docker.io/library/mysql:8.4';

export async function createBaseImage(options: BaseImageOptions): Promise<BaseImageResult> {
    const rootDir = options.rootDir ?? process.cwd();
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const timer = new MigrationTimer();
    const mysqlImage = options.mysqlImage ?? defaultMysqlImage;
    const chainId = options.chainId ?? createChainId();
    const catalog = await createMigrationCatalog(rootDir);
    const database = new MysqlImageDatabase(runtime, options.verbose ?? false);
    const dump = options.dump ? expandHome(options.dump) : undefined;
    const dumpSha256 = dump ? await sha256File(dump) : undefined;
    const container = safeContainerName(`stamhoofd-migrations-base-${chainId}`);
    const startedAt = new Date().toISOString();
    await timer.measure('assert-image-missing', { image: options.tag }, () => assertImageMissing(runtime, options.tag));

    try {
        await timer.measure('start-container', { image: mysqlImage, container, publishPort: false }, () => database.start(mysqlImage, container));
        await timer.measure('create-database', { container, database: options.database }, () => database.createDatabase(container, options.database));
        if (dump) {
            await timer.measure('import-dump', { container, database: options.database, dump }, () => database.importDump(container, dump, options.database));
        } else {
            timer.skipped('import-dump', { container, database: options.database });
        }
        const baseProgress = await timer.measure('detect-applied-migrations', { container, database: options.database }, async () => {
            const executed = await database.listExecutedMigrations(container, options.database);
            return detectBaseMigrationProgress(catalog, executed);
        });
        await timer.measure('prepare-metadata', { container }, () => Promise.resolve());
        const finishedAt = new Date().toISOString();
        const manifest: MigrationImageManifest = {
            version: 1,
            chainId,
            role: 'base',
            status: 'base',
            database: options.database,
            image: options.tag,
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
            timings: timer.snapshot(),
        };
        await database.writeManifest(container, manifest);
        await timer.measure('stop-mysql', { container }, () => database.stopForCommit(container));
        const imageId = await runtime.commit(container, options.tag, { labels: labelsForManifest(manifest) });
        return { chainId, image: options.tag, imageId, dumpSha256, manifest };
    } finally {
        await runtime.remove(container);
    }
}

export async function runMigrationChain(options: RunMigrationChainOptions): Promise<MigrationChainResult> {
    const rootDir = options.rootDir ?? process.cwd();
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const chainId = options.chainId ?? createChainId();
    const build = options.build ?? 'auto';
    const allowChangedFiles = options.allowChangedFiles ?? false;
    const continueOnFailure = options.continueOnFailure ?? false;
    await buildRequiredPackages(rootDir, build, options.verbose ?? false);

    const catalog = options.catalog ?? await createMigrationCatalog(rootDir);
    const changedFiles = options.previousCatalog ? compareCatalogs(options.previousCatalog, catalog) : [];
    if (changedFiles.length > 0 && !allowChangedFiles) {
        throw new Error(`Migration files changed since the previous chain: ${changedFiles.map(file => file.normalizedFile).join(', ')}`);
    }

    const baseProgress = await readBaseMigrationProgress(runtime, options.baseImage);
    const startFrom = options.startFrom ?? startFromBaseProgress(catalog, baseProgress);
    const migrations = !options.startFrom && baseProgress.completed >= catalog.entries.length
        ? []
        : selectMigrations(catalog, startFrom);
    const database = new MysqlImageDatabase(runtime, options.verbose ?? false);
    const results: MigrationExecutionResult[] = [];
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
            await timer.measure('assert-image-missing', { image: tag }, () => assertImageMissing(runtime, tag));
            await timer.measure('start-container', { image: parentImage, container, publishPort: true }, () => database.start(parentImage, container, { publishPort: true }));
            const port = await timer.measure('resolve-mapped-port', { container }, () => database.mappedPort(container));
            const run = await timer.measure('run-migration', { container, port, migration: migration.normalizedFile }, () => runCommand('node', ['--enable-source-maps', path.join(rootDir, 'backend/app/api/dist/single-migration.js'), '--file', compiledMigrationPath(rootDir, migration), '--name', migration.normalizedFile], {
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
        } catch (e) {
            status = 'failed';
            error = e instanceof Error ? e.message : String(e);
            log = [log, error].filter(Boolean).join('\n');
        }

        await timer.measure('prepare-metadata', { container, logBytes: Buffer.byteLength(log) }, () => Promise.resolve());
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
            timings: timer.snapshot(),
        };
        await database.writeManifest(container, manifest, { [`${migration.normalizedFile}.log`]: log });
        await timer.measure('stop-mysql', { container }, () => database.stopForCommit(container));
        const imageId = await runtime.commit(container, tag, { labels: labelsForManifest(manifest) });
        await runtime.remove(container);

        results.push({ migration, status, image: tag, imageId, startedAt, finishedAt, log, error });
        options.onProgress?.({ type: 'migration:finish', chainId, result: results[results.length - 1], completed: results.length, total: migrations.length });
        parentImage = tag;
        if (status === 'failed' && !continueOnFailure) {
            break;
        }
    }

    options.onProgress?.({ type: 'done', chainId, completed: results.length, total: migrations.length });
    return { chainId, catalog, changedFiles, results };
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
