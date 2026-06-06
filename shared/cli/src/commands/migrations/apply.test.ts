import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runMigrationChain } from '@stamhoofd/migrations-manager';
import MigrationsApply from './apply.js';

vi.mock('@stamhoofd/migrations-manager', () => ({
    createCliContainerRuntime: vi.fn(async () => ({ command: 'docker' })),
    createMigrationCatalog: vi.fn(async () => ({ entries: [] })),
    detectStaleMigrationOutputs: vi.fn(async () => []),
    listMigrationImages: vi.fn(async () => []),
    runMigrationChain: vi.fn(async () => ({ chainId: 'chain-1', results: [] })),
}));

vi.mock('../../config/build-config.js', () => ({
    buildBackendEnv: vi.fn(() => ({ DB_DATABASE: 'stamhoofd-development' })),
}));

describe('MigrationsApply command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('forwards migration chain options', async () => {
        const command = new MigrationsApply([], {} as any);
        (command as any).parse = vi.fn(async () => ({
            flags: {
                env: 'keeo',
                verbose: true,
                base: 'stamhoofd-migrations/dev:base',
                'tag-prefix': 'stamhoofd-migrations/dev',
                database: 'stamhoofd-development',
                'continue-on-failure': true,
                'allow-changed-files': true,
                build: 'force',
                'mysql-image': 'mysql:8.4',
                limit: 3,
            },
        }));
        (command as any).createContext = vi.fn(async () => ({ rootDir: '/repo', env: 'keeo', verbose: true }));

        await command.run();

        expect(runMigrationChain).toHaveBeenCalledWith(expect.objectContaining({
            rootDir: '/repo',
            baseImage: 'stamhoofd-migrations/dev:base',
            tagPrefix: 'stamhoofd-migrations/dev',
            database: 'stamhoofd-development',
            continueOnFailure: true,
            allowChangedFiles: true,
            build: 'force',
            mysqlImage: 'mysql:8.4',
            limit: 3,
            verbose: true,
            env: { DB_DATABASE: 'stamhoofd-development' },
            telemetry: true,
            onProgress: expect.any(Function),
        }));
    });

    it('suggests a new tag prefix when a generated image already exists', async () => {
        vi.mocked(runMigrationChain).mockRejectedValueOnce(new Error('Image already exists: stamhoofd-migrations/dev:0001-create'));
        const command = new MigrationsApply([], {} as any);
        (command as any).parse = vi.fn(async () => ({
            flags: {
                env: 'keeo',
                verbose: false,
                base: 'stamhoofd-migrations/dev:base',
                'tag-prefix': 'stamhoofd-migrations/dev',
                database: 'stamhoofd-development',
                'continue-on-failure': false,
                'allow-changed-files': false,
                build: 'skip',
                'mysql-image': 'mysql:8.4',
            },
        }));
        (command as any).createContext = vi.fn(async () => ({ rootDir: '/repo', env: 'keeo', verbose: false }));

        await expect(command.run()).rejects.toThrow('Choose a different --tag-prefix');
    });
});
