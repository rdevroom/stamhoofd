import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MysqlImageDatabase } from './mysql-image-database.js';
import { runPipeline } from './runtime.js';
import type { ContainerRuntime } from './types.js';

vi.mock('./runtime.js', async importOriginal => ({
    ...await importOriginal<typeof import('./runtime.js')>(),
    runPipeline: vi.fn(async () => undefined),
}));

describe('MysqlImageDatabase', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('streams encrypted and compressed dumps into mysql without copying plaintext files', async () => {
        const runtime = createRuntime();
        const database = new MysqlImageDatabase(runtime, false);

        await database.importDump('base-container', '/tmp/database.sql.gz.gpg', 'stamhoofd_migrations');

        expect(runPipeline).toHaveBeenCalledWith([
            { command: 'gpg', args: ['--batch', '--decrypt', '/tmp/database.sql.gz.gpg'] },
            { command: 'gzip', args: ['-dc'] },
            { command: 'docker', args: ['exec', '-i', 'base-container', 'mysql', '-h127.0.0.1', '-uroot', '-proot', '--max_allowed_packet=1G', 'stamhoofd_migrations'] },
        ], { verbose: false });
        expect(runtime.copyToContainer).not.toHaveBeenCalled();
    });

    it('streams plain sql dumps into mysql', async () => {
        const runtime = createRuntime();
        const database = new MysqlImageDatabase(runtime, true);

        await database.importDump('base-container', '/tmp/database.sql', 'stamhoofd_migrations');

        expect(runPipeline).toHaveBeenCalledWith([
            { command: 'cat', args: ['/tmp/database.sql'] },
            { command: 'docker', args: ['exec', '-i', 'base-container', 'mysql', '-h127.0.0.1', '-uroot', '-proot', '--max_allowed_packet=1G', 'stamhoofd_migrations'] },
        ], { verbose: true });
        expect(runtime.copyToContainer).not.toHaveBeenCalled();
    });

    it('uses the provided temporary GPG home for encrypted dumps', async () => {
        const runtime = createRuntime();
        const database = new MysqlImageDatabase(runtime, false);

        await database.importDump('base-container', '/tmp/database.sql.gpg', 'stamhoofd_migrations', { gpgHome: '/tmp/stamhoofd-gpg/gnupg' });

        expect(runPipeline).toHaveBeenCalledWith([
            { command: 'gpg', args: ['--homedir', '/tmp/stamhoofd-gpg/gnupg', '--batch', '--decrypt', '/tmp/database.sql.gpg'] },
            { command: 'docker', args: ['exec', '-i', 'base-container', 'mysql', '-h127.0.0.1', '-uroot', '-proot', '--max_allowed_packet=1G', 'stamhoofd_migrations'] },
        ], { verbose: false });
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
