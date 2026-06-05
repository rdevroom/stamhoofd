import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBaseImage } from '@stamhoofd/migrations-manager';
import MigrationsCreateBase from './create-base.js';

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

describe('MigrationsCreateBase command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
            chainId: 'base',
            mysqlImage: 'mysql:8.4',
            verbose: true,
            runtime: expect.any(Object),
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
});
