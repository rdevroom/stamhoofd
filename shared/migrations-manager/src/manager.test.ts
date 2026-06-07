import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBaseImage, runMigrationChain } from './manager.js';
import type { ContainerRuntime, MigrationImageManifest } from './types.js';

const mocks = vi.hoisted(() => ({
    database: {
        start: vi.fn(async () => undefined),
        createDatabase: vi.fn(async () => undefined),
        importDump: vi.fn(async () => undefined),
        disableRedoLog: vi.fn(async () => undefined),
        enableRedoLog: vi.fn(async () => undefined),
        listExecutedMigrations: vi.fn(async () => []),
        mappedPort: vi.fn(async () => '3307'),
        writeManifest: vi.fn(async () => undefined),
        stopForCommit: vi.fn(async () => undefined),
    },
    runCommand: vi.fn(async () => ({ stdout: 'git-revision', stderr: '', status: 0 })),
}));

vi.mock('./mysql-image-database.js', () => ({
    MysqlImageDatabase: vi.fn(() => mocks.database),
}));

vi.mock('./runtime.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./runtime.js')>();
    return {
        ...actual,
        runCommand: mocks.runCommand,
    };
});

let root: string;

describe('createBaseImage', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mocks.runCommand.mockResolvedValue({ stdout: 'git-revision', stderr: '', status: 0 });
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'stamhoofd-manager-'));
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it('records unknown when dump hashing fails', async () => {
        const runtime = createRuntime();
        const dump = path.join(root, 'missing.sql');

        const result = await createBaseImage({
            rootDir: root,
            runtime,
            dump,
            database: 'stamhoofd_migrations',
            tag: 'stamhoofd-migrations/test:base',
            chainId: 'test-chain',
            telemetry: false,
        });

        expect(result.dumpSha256).toBe('unknown');
        expect(mocks.database.importDump).toHaveBeenCalledWith(expect.any(String), dump, 'stamhoofd_migrations', { gpgHome: undefined, onProgress: expect.any(Function) });
        expect(manifest()).toEqual(expect.objectContaining({ dumpSha256: 'unknown' }));
    });

    it('forwards import progress events', async () => {
        const runtime = createRuntime();
        const dump = path.join(root, 'database.sql');
        const onProgress = vi.fn();
        mocks.database.importDump.mockImplementationOnce(async (_container, _dump, _database, options) => {
            options.onProgress({ totalTables: 57, createdTables: 12 });
        });

        await createBaseImage({
            rootDir: root,
            runtime,
            dump,
            database: 'stamhoofd_migrations',
            tag: 'stamhoofd-migrations/test:base',
            chainId: 'test-chain',
            telemetry: false,
            onProgress,
        });

        expect(onProgress).toHaveBeenCalledWith({ type: 'import:progress', totalTables: 57, createdTables: 12 });
    });

    it('disables redo logging around unsafe dump imports', async () => {
        const runtime = createRuntime();
        const dump = path.join(root, 'database.sql');
        await fs.writeFile(dump, 'SELECT 1;');

        await createBaseImage({
            rootDir: root,
            runtime,
            dump,
            database: 'stamhoofd_migrations',
            tag: 'stamhoofd-migrations/test:base',
            chainId: 'test-chain',
            telemetry: false,
            mysqlTuning: {
                unsafe: true,
                bufferPoolSize: '8G',
                redoLogCapacity: '4G',
                logBufferSize: '256M',
                ioCapacity: 20000,
                ioCapacityMax: 40000,
                changeBuffering: 'all',
                changeBufferMaxSize: 50,
            },
        });

        expect(mocks.database.disableRedoLog.mock.invocationCallOrder[0]).toBeLessThan(mocks.database.importDump.mock.invocationCallOrder[0]);
        expect(mocks.database.enableRedoLog.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.database.importDump.mock.invocationCallOrder[0]);
    });

    it('records the last contiguous applied migration instead of the highest matching migration', async () => {
        await writeMigrationFiles(['001-first.sql', '002-second.sql'], [], ['999-late.ts']);
        mocks.database.listExecutedMigrations.mockResolvedValueOnce(['001-first.sql', '999-late.js']);
        const runtime = createRuntime();

        await createBaseImage({
            rootDir: root,
            runtime,
            database: 'stamhoofd_migrations',
            tag: 'stamhoofd-migrations/test:base',
            chainId: 'test-chain',
            telemetry: false,
        });

        expect(manifest()).toEqual(expect.objectContaining({
            baseMigrationCount: 2,
            baseMigrationTotal: 3,
            baseLastMigration: '001-first.sql',
            baseLastMigrationIndex: 0,
        }));
    });
});

describe('runMigrationChain', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mocks.runCommand.mockResolvedValue({ stdout: 'git-revision', stderr: '', status: 0 });
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'stamhoofd-manager-'));
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it('probes for a pending migration when base labels say the catalog is complete', async () => {
        await writeMigrationFiles(['001-first.sql', '002-second.sql'], [], []);
        const runtime = createRuntime({ baseCompleted: 99 });
        mocks.runCommand.mockImplementation(async (command, args) => {
            if (command === 'git') {
                return { stdout: 'git-revision', stderr: '', status: 0 };
            }
            expect(args).toContain('--catalog');
            return { stdout: '__stamhoofd_migration_applied__:002-second.sql', stderr: '', status: 0 };
        });

        const result = await runMigrationChain({
            rootDir: root,
            runtime,
            baseImage: 'stamhoofd-migrations/test:base',
            tagPrefix: 'stamhoofd-migrations/test',
            database: 'stamhoofd_migrations',
            build: 'skip',
            telemetry: false,
        });

        expect(result.results).toHaveLength(1);
        expect(result.results[0].migration.normalizedFile).toBe('002-second.sql');
        expect(result.results[0].image).toBe('stamhoofd-migrations/test:0002-002-second');
        expect(runtime.commit).toHaveBeenCalled();
    });

    it('does not commit an image when the probe reports no pending migrations', async () => {
        await writeMigrationFiles(['001-first.sql'], [], []);
        const runtime = createRuntime({ baseCompleted: 99 });
        mocks.runCommand.mockImplementation(async (command) => {
            if (command === 'git') {
                return { stdout: 'git-revision', stderr: '', status: 0 };
            }
            return { stdout: 'No pending migrations left.', stderr: '', status: 42 };
        });

        const result = await runMigrationChain({
            rootDir: root,
            runtime,
            baseImage: 'stamhoofd-migrations/test:base',
            tagPrefix: 'stamhoofd-migrations/test',
            database: 'stamhoofd_migrations',
            build: 'skip',
            telemetry: false,
        });

        expect(result.results).toHaveLength(0);
        expect(runtime.commit).not.toHaveBeenCalled();
    });
});

function createRuntime(options: { baseCompleted?: number } = {}): ContainerRuntime {
    return {
        command: 'docker',
        run: vi.fn(async () => ({ stdout: '', stderr: '', status: 0 })),
        exec: vi.fn(async () => ({ stdout: '', stderr: '', status: 0 })),
        stop: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
        commit: vi.fn(async () => 'image-id'),
        inspectImage: vi.fn(async (image: string) => {
            if (image === 'stamhoofd-migrations/test:base' && options.baseCompleted !== undefined) {
                return {
                    id: 'base-image-id',
                    repoTags: [image],
                    labels: {
                        'be.stamhoofd.migrations.role': 'base',
                        'be.stamhoofd.migrations.chain': 'base-chain',
                        'be.stamhoofd.migrations.base-last-migration-index': String(options.baseCompleted - 1),
                    },
                };
            }
            throw new Error('missing image');
        }),
        listImagesByLabel: vi.fn(async () => []),
        logs: vi.fn(async () => ''),
        copyToContainer: vi.fn(async () => undefined),
    };
}

function manifest(): MigrationImageManifest {
    return mocks.database.writeManifest.mock.calls.at(-1)?.[1] as MigrationImageManifest;
}

async function writeMigrationFiles(models: string[], email: string[], api: string[]): Promise<void> {
    const folders = [
        ['backend/shared/models/src/migrations', models],
        ['backend/shared/email/migrations', email],
        ['backend/app/api/src/migrations', api],
    ] as const;
    for (const [folder, files] of folders) {
        const absolute = path.join(root, folder);
        await fs.mkdir(absolute, { recursive: true });
        for (const file of files) {
            await fs.writeFile(path.join(absolute, file), file.endsWith('.sql') ? 'SELECT 1;' : 'export default { up: async () => undefined };');
        }
    }
}
