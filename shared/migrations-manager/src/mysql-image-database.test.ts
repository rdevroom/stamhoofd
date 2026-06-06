import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MysqlImageDatabase } from './mysql-image-database.js';
import { scanDumpMetadata } from './dump-metadata.js';
import { runPipeline } from './runtime.js';
import type { ContainerRuntime } from './types.js';

vi.mock('./runtime.js', async importOriginal => ({
    ...await importOriginal<typeof import('./runtime.js')>(),
    runPipeline: vi.fn(async () => undefined),
}));

vi.mock('./dump-metadata.js', () => ({
    scanDumpMetadata: vi.fn(async () => ({ totalTables: 57 })),
}));

describe('MysqlImageDatabase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(scanDumpMetadata).mockResolvedValue({ totalTables: 57 });
    });

    it('streams encrypted and compressed .enc dumps into mysql without copying plaintext files', async () => {
        const runtime = createRuntime();
        const database = new MysqlImageDatabase(runtime, false);

        await database.importDump('base-container', '/tmp/database.sql.gz.enc', 'stamhoofd_migrations');

        expect(runPipeline).toHaveBeenCalledWith([
            { command: 'gpg', args: ['--batch', '--decrypt', '/tmp/database.sql.gz.enc'] },
            { command: 'gzip', args: ['-dc'] },
            { command: 'docker', args: ['exec', '-i', 'base-container', 'mysql', '-h127.0.0.1', '-uroot', '-proot', '--max_allowed_packet=1G', '--init-command=SET SESSION sql_log_bin=0; SET SESSION foreign_key_checks=0; SET SESSION unique_checks=0;', 'stamhoofd_migrations'] },
        ], { verbose: false });
        expect(runtime.copyToContainer).not.toHaveBeenCalled();
    });

    it('streams plain sql dumps into mysql', async () => {
        const runtime = createRuntime();
        const database = new MysqlImageDatabase(runtime, true);

        await database.importDump('base-container', '/tmp/database.sql', 'stamhoofd_migrations');

        expect(runPipeline).toHaveBeenCalledWith([
            { command: 'cat', args: ['/tmp/database.sql'] },
            { command: 'docker', args: ['exec', '-i', 'base-container', 'mysql', '-h127.0.0.1', '-uroot', '-proot', '--max_allowed_packet=1G', '--init-command=SET SESSION sql_log_bin=0; SET SESSION foreign_key_checks=0; SET SESSION unique_checks=0;', 'stamhoofd_migrations'] },
        ], { verbose: true });
        expect(runtime.copyToContainer).not.toHaveBeenCalled();
    });

    it('uses the provided temporary GPG home for encrypted dumps', async () => {
        const runtime = createRuntime();
        const database = new MysqlImageDatabase(runtime, false);

        await database.importDump('base-container', '/tmp/database.sql.gpg', 'stamhoofd_migrations', { gpgHome: '/tmp/stamhoofd-gpg/gnupg' });

        expect(runPipeline).toHaveBeenCalledWith([
            { command: 'gpg', args: ['--homedir', '/tmp/stamhoofd-gpg/gnupg', '--batch', '--decrypt', '/tmp/database.sql.gpg'] },
            { command: 'docker', args: ['exec', '-i', 'base-container', 'mysql', '-h127.0.0.1', '-uroot', '-proot', '--max_allowed_packet=1G', '--init-command=SET SESSION sql_log_bin=0; SET SESSION foreign_key_checks=0; SET SESSION unique_checks=0;', 'stamhoofd_migrations'] },
        ], { verbose: false });
    });

    it('emits best-effort import progress while importing', async () => {
        const runtime = createRuntime();
        let finishImport!: () => void;
        vi.mocked(runPipeline).mockImplementationOnce(async () => {
            await new Promise<void>(resolve => finishImport = resolve);
        });
        vi.mocked(runtime.exec).mockImplementation(async (_container, args) => {
            const query = args.at(-1);
            if (query === "SHOW GLOBAL STATUS LIKE 'Bytes_received';") {
                return { stdout: 'Bytes_received\t1000\n', stderr: '', status: 0 };
            }
            if (typeof query === 'string' && query.includes('information_schema.TABLES')) {
                return { stdout: '12\t345\n', stderr: '', status: 0 };
            }
            return { stdout: '', stderr: '', status: 0 };
        });
        const database = new MysqlImageDatabase(runtime, false);
        const onProgress = vi.fn();

        const importPromise = database.importDump('base-container', '/tmp/database.sql', 'stamhoofd_migrations', { onProgress });

        await vi.waitFor(() => {
            expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ createdTables: 12, rows: 345 }));
        });
        finishImport();
        await importPromise;

        expect(scanDumpMetadata).toHaveBeenCalledWith('/tmp/database.sql', expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ metadataStatus: 'done', totalTables: 57 }));
    });

    it('does not fail the import when metadata scanning fails', async () => {
        vi.mocked(scanDumpMetadata).mockRejectedValueOnce(new Error('scan failed'));
        const runtime = createRuntime();
        const database = new MysqlImageDatabase(runtime, false);
        const onProgress = vi.fn();

        await database.importDump('base-container', '/tmp/database.sql', 'stamhoofd_migrations', { onProgress });

        expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ metadataStatus: 'failed' }));
        expect(runPipeline).toHaveBeenCalled();
    });

    it('starts MySQL with unsafe tuning options', async () => {
        const runtime = createRuntime();
        const database = new MysqlImageDatabase(runtime, false);

        runtime.exec = vi.fn(async () => ({ stdout: '', stderr: '', status: 0 }));
        await database.start('mysql:8.4', 'base-container', {
            tuning: {
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

        expect(runtime.run).toHaveBeenCalledWith(expect.arrayContaining([
            '--innodb-buffer-pool-size=8G',
            '--innodb-redo-log-capacity=4G',
            '--innodb-log-buffer-size=256M',
            '--innodb-io-capacity=20000',
            '--innodb-io-capacity-max=40000',
            '--innodb-change-buffering=all',
            '--innodb-change-buffer-max-size=50',
            '--innodb-flush-log-at-trx-commit=0',
            '--sync-binlog=0',
            '--disable-log-bin',
            '--skip-innodb-doublewrite',
        ]), { verbose: false });
    });
});

function createRuntime(): ContainerRuntime & { copyToContainer: ReturnType<typeof vi.fn> } {
    return {
        command: 'docker',
        run: vi.fn(),
        exec: vi.fn(),
        stop: vi.fn(),
        remove: vi.fn(),
        commit: vi.fn(),
        inspectImage: vi.fn(),
        listImagesByLabel: vi.fn(),
        logs: vi.fn(),
        copyToContainer: vi.fn(),
    } as unknown as ContainerRuntime & { copyToContainer: ReturnType<typeof vi.fn> };
}
