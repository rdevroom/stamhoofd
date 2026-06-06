import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBaseImage } from './manager.js';
import type { ContainerRuntime, MigrationImageManifest } from './types.js';

const mocks = vi.hoisted(() => ({
    database: {
        start: vi.fn(async () => undefined),
        createDatabase: vi.fn(async () => undefined),
        importDump: vi.fn(async () => undefined),
        disableRedoLog: vi.fn(async () => undefined),
        enableRedoLog: vi.fn(async () => undefined),
        listExecutedMigrations: vi.fn(async () => []),
        writeManifest: vi.fn(async () => undefined),
        stopForCommit: vi.fn(async () => undefined),
    },
}));

vi.mock('./mysql-image-database.js', () => ({
    MysqlImageDatabase: vi.fn(() => mocks.database),
}));

let root: string;

describe('createBaseImage', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
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
        expect(mocks.database.importDump).toHaveBeenCalledWith(expect.any(String), dump, 'stamhoofd_migrations', { gpgHome: undefined });
        expect(manifest()).toEqual(expect.objectContaining({ dumpSha256: 'unknown' }));
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
});

function createRuntime(): ContainerRuntime {
    return {
        command: 'docker',
        run: vi.fn(async () => ({ stdout: '', stderr: '', status: 0 })),
        exec: vi.fn(async () => ({ stdout: '', stderr: '', status: 0 })),
        stop: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
        commit: vi.fn(async () => 'image-id'),
        inspectImage: vi.fn(async () => {
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
