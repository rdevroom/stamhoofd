import path from 'node:path';
import { buildRequiredPackages } from './build.js';
import { compareCatalogs, createMigrationCatalog, selectMigrations, sha256File } from './catalog.js';
import { labelsForManifest } from './labels.js';
import { MysqlImageDatabase } from './mysql-image-database.js';
import { createCliContainerRuntime, runCommand } from './runtime.js';
import type { BaseImageOptions, BaseImageResult, MigrationChainResult, MigrationExecutionResult, MigrationImageManifest, RunMigrationChainOptions } from './types.js';

const defaultMysqlImage = 'docker.io/library/mysql:8.4';

export async function createBaseImage(options: BaseImageOptions): Promise<BaseImageResult> {
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const mysqlImage = options.mysqlImage ?? defaultMysqlImage;
    const chainId = options.chainId ?? createChainId();
    const database = new MysqlImageDatabase(runtime, options.verbose ?? false);
    const dump = options.dump ? expandHome(options.dump) : undefined;
    const dumpSha256 = dump ? await sha256File(dump) : undefined;
    const container = `stamhoofd-migrations-base-${chainId}`;
    const startedAt = new Date().toISOString();
    await assertImageMissing(runtime, options.tag);

    try {
        await database.start(mysqlImage, container);
        await database.createDatabase(container, options.database);
        if (dump) {
            await database.importDump(container, dump, options.database);
        }
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
        };
        await database.writeManifest(container, manifest);
        await database.stopForCommit(container);
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

    const catalog = await createMigrationCatalog(rootDir);
    const changedFiles = options.previousCatalog ? compareCatalogs(options.previousCatalog, catalog) : [];
    if (changedFiles.length > 0 && !allowChangedFiles) {
        throw new Error(`Migration files changed since the previous chain: ${changedFiles.map(file => file.normalizedFile).join(', ')}`);
    }

    const migrations = selectMigrations(catalog, options.startFrom);
    const database = new MysqlImageDatabase(runtime, options.verbose ?? false);
    const results: MigrationExecutionResult[] = [];
    let parentImage = options.baseImage;

    for (const migration of migrations) {
        const tag = `${options.tagPrefix}:${String(migration.index + 1).padStart(4, '0')}-${slug(migration.normalizedFile)}`;
        await assertImageMissing(runtime, tag);
        const container = `stamhoofd-migrations-${chainId}-${migration.index}`;
        const startedAt = new Date().toISOString();
        let status: 'success' | 'failed' = 'success';
        let log = '';
        let error: string | undefined;
        try {
            await database.start(parentImage, container, { publishPort: true });
            const port = await database.mappedPort(container);
            const run = await runCommand('node', ['--enable-source-maps', path.join(rootDir, 'backend/app/api/dist/single-migration.js'), '--file', compiledMigrationPath(rootDir, migration), '--name', migration.normalizedFile], {
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
            });
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
            previousChainId: options.previousChainId,
        };
        await database.writeManifest(container, manifest, { [`${migration.normalizedFile}.log`]: log });
        await database.stopForCommit(container);
        const imageId = await runtime.commit(container, tag, { labels: labelsForManifest(manifest) });
        await runtime.remove(container);

        results.push({ migration, status, image: tag, imageId, startedAt, finishedAt, log, error });
        parentImage = tag;
        if (status === 'failed' && !continueOnFailure) {
            break;
        }
    }

    return { chainId, catalog, changedFiles, results };
}

function createChainId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function assertImageMissing(runtime: { inspectImage(image: string): Promise<unknown> }, image: string): Promise<void> {
    try {
        await runtime.inspectImage(image);
    } catch {
        return;
    }
    throw new Error(`Image already exists: ${image}`);
}

function compiledMigrationPath(rootDir: string, migration: { sourcePath: string }): string {
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
