import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBaseImage } from '@stamhoofd/migrations-manager';
import { input, select } from '@inquirer/prompts';
import MigrationsCreateBase from './create-base.js';
import { run } from '../../runtime/command-runner.js';

vi.mock('@stamhoofd/migrations-manager', () => ({
    createCliContainerRuntime: vi.fn(async () => ({ command: 'docker' })),
    createBaseImage: vi.fn(async () => ({
        chainId: 'chain-1',
        image: 'stamhoofd-migrations/dev:base',
        imageId: 'image-id',
        manifest: {},
    })),
    listMigrationImages: vi.fn(async () => []),
}));

vi.mock('../../runtime/command-runner.js', () => ({
    run: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => ({
    input: vi.fn(),
    select: vi.fn(),
}));

describe('MigrationsCreateBase command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
        vi.mocked(run).mockImplementation(async (command, args) => {
            if (command === 'gpg' && args[0] === '--version') {
                return { stdout: 'gpg (GnuPG) 2.4.0\n', stderr: '', status: 0 };
            }
            if (command === 'gpg' && args.includes('--decrypt')) {
                return { stdout: '', stderr: '', status: 0 };
            }
            if (command === 'gzip' && args[0] === '--version') {
                return { stdout: 'gzip 1.12\n', stderr: '', status: 0 };
            }
            return undefined;
        });
    });

    it('forwards base image options', async () => {
        const command = new MigrationsCreateBase([], {} as any);
        (command as any).parse = vi.fn(async () => ({
            flags: {
                verbose: true,
                dump: '/tmp/database.dump',
                database: 'stamhoofd-development',
                tag: 'stamhoofd-migrations/dev:base',
                'mysql-image': 'mysql:8.4',
            },
        }));
        (command as any).createContext = vi.fn(async () => ({ rootDir: '/repo', verbose: true }));

        await command.run();

        expect(createBaseImage).toHaveBeenCalledWith(expect.objectContaining({
            rootDir: '/repo',
            dump: '/tmp/database.dump',
            database: 'stamhoofd-development',
            tag: 'stamhoofd-migrations/dev:base',
            chainId: 'stamhoofd-migrations/dev:base',
            displayName: 'stamhoofd-migrations/dev:base',
            onProgress: expect.any(Function),
            mysqlImage: 'mysql:8.4',
            verbose: true,
            runtime: expect.any(Object),
            telemetry: true,
        }));
    });

    it('suggests a new tag when the base image already exists', async () => {
        vi.mocked(createBaseImage).mockRejectedValueOnce(new Error('Image already exists: stamhoofd-migrations/dev:base'));
        const command = new MigrationsCreateBase([], {} as any);
        (command as any).parse = vi.fn(async () => ({
            flags: {
                verbose: false,
                dump: undefined,
                database: 'stamhoofd-development',
                tag: 'stamhoofd-migrations/dev:base',
                'mysql-image': 'mysql:8.4',
            },
        }));
        (command as any).createContext = vi.fn(async () => ({ rootDir: '/repo', verbose: false }));

        await expect(command.run()).rejects.toThrow('Choose a different --tag');
    });

    it('accepts encrypted and compressed .enc database exports', async () => {
        vi.stubEnv('HOME', '/home/test');
        const command = new MigrationsCreateBase([], {} as any);
        (command as any).parse = vi.fn(async () => ({
            flags: {
                verbose: false,
                dump: '~/database.sql.gz.enc',
                database: 'stamhoofd-development',
                tag: 'stamhoofd-migrations/dev:base',
                'mysql-image': undefined,
            },
        }));
        (command as any).createContext = vi.fn(async () => ({ rootDir: '/repo', verbose: false }));

        await command.run();

        expect(run).toHaveBeenCalledWith('gpg', ['--version'], { capture: true, allowFailure: true });
        expect(run).toHaveBeenCalledWith('gzip', ['--version'], { capture: true, allowFailure: true });
        expect(run).toHaveBeenCalledWith('gpg', ['--batch', '--decrypt', '--output', expect.any(String), '/home/test/database.sql.gz.enc'], { capture: true, allowFailure: true, verbose: false });
        expect(createBaseImage).toHaveBeenCalledWith(expect.objectContaining({
            dump: '/home/test/database.sql.gz.enc',
            dumpGpgHome: undefined,
        }));
    });

    it('imports a selected 1Password private key into a temporary GPG home for encrypted exports', async () => {
        vi.mocked(run).mockImplementation(async (command, args) => {
            if (command === 'gpg' && args[0] === '--version') {
                return { stdout: 'gpg (GnuPG) 2.4.0\n', stderr: '', status: 0 };
            }
            if (command === 'gzip' && args[0] === '--version') {
                return { stdout: 'gzip 1.12\n', stderr: '', status: 0 };
            }
            if (command === 'gpg' && args.includes('--decrypt') && !args.includes('--homedir')) {
                return { stdout: '', stderr: 'gpg: public key decryption failed: No secret key\ngpg: decryption failed: No secret key', status: 2 };
            }
            if (command === 'op' && args[0] === 'account' && args[1] === 'list') {
                return { stdout: JSON.stringify([{ email: 'dev@example.com', url: 'stamhoofd.1password.eu' }]), stderr: '', status: 0 };
            }
            if (command === 'op' && args[0] === 'item' && args[1] === 'list') {
                return { stdout: JSON.stringify([{ id: 'item-1', title: 'Backup private key', vault: { id: 'vault-1', name: 'Engineering' } }]), stderr: '', status: 0 };
            }
            if (command === 'op' && args[0] === 'item' && args[1] === 'get') {
                return { stdout: JSON.stringify({ value: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nkey\n-----END PGP PRIVATE KEY BLOCK-----' }), stderr: '', status: 0 };
            }
            if (command === 'gpg' && args.includes('--import')) {
                return undefined;
            }
            if (command === 'gpg' && args.includes('--decrypt') && args.includes('--homedir')) {
                return { stdout: '', stderr: '', status: 0 };
            }
            return undefined;
        });
        vi.mocked(select)
            .mockResolvedValueOnce('__stamhoofd_import_private_key_from_1password__')
            .mockResolvedValueOnce('__stamhoofd_search_all_vaults__')
            .mockResolvedValueOnce('0');
        vi.mocked(input).mockResolvedValueOnce('backup');
        const command = new MigrationsCreateBase([], {} as any);
        (command as any).parse = vi.fn(async () => ({
            flags: {
                verbose: false,
                dump: '/tmp/database.sql.gz.gpg',
                database: 'stamhoofd-development',
                tag: 'stamhoofd-migrations/dev:base',
                'mysql-image': undefined,
            },
        }));
        (command as any).createContext = vi.fn(async () => ({ rootDir: '/repo', verbose: false }));

        await command.run();

        expect(run).toHaveBeenCalledWith('op', ['item', 'get', 'item-1', '--format', 'json', '--account', 'stamhoofd.1password.eu', '--vault', 'vault-1'], { capture: true });
        expect(run).toHaveBeenCalledWith('gpg', ['--homedir', expect.stringContaining('gnupg'), '--batch', '--import', expect.stringContaining('private-key.asc')], { verbose: false });
        expect(createBaseImage).toHaveBeenCalledWith(expect.objectContaining({
            dump: '/tmp/database.sql.gz.gpg',
            dumpGpgHome: expect.stringContaining('gnupg'),
        }));
    });

    it('fails encrypted database exports when gpg is missing', async () => {
        vi.mocked(run).mockImplementation(async (command, args) => {
            if (command === 'gpg' && args[0] === '--version') {
                return { stdout: '', stderr: 'missing', status: 1 };
            }
            return undefined;
        });
        const command = new MigrationsCreateBase([], {} as any);
        (command as any).parse = vi.fn(async () => ({
            flags: {
                verbose: false,
                dump: '/tmp/database.sql.gpg',
                database: 'stamhoofd-development',
                tag: 'stamhoofd-migrations/dev:base',
                'mysql-image': undefined,
            },
        }));
        (command as any).createContext = vi.fn(async () => ({ rootDir: '/repo', verbose: false }));

        await expect(command.run()).rejects.toThrow('GPG database export encryption requirement not met.');
        expect(createBaseImage).not.toHaveBeenCalled();
    });
});
