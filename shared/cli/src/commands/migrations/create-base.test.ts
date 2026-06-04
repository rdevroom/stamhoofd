import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBaseImage } from '@stamhoofd/migrations-manager';
import MigrationsCreateBase from './create-base.js';

vi.mock('@stamhoofd/migrations-manager', () => ({
    createBaseImage: vi.fn(async () => ({
        chainId: 'chain-1',
        image: 'stamhoofd-migrations/dev:base',
        imageId: 'image-id',
        manifest: {},
    })),
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

        await command.run();

        expect(createBaseImage).toHaveBeenCalledWith({
            dump: '/tmp/database.dump',
            database: 'stamhoofd-development',
            tag: 'stamhoofd-migrations/dev:base',
            mysqlImage: 'mysql:8.4',
            verbose: true,
        });
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

        await expect(command.run()).rejects.toThrow('Choose a different --tag');
    });
});
