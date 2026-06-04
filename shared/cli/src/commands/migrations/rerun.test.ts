import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveRerunStart, runMigrationChain } from '@stamhoofd/migrations-manager';
import MigrationsRerun from './rerun.js';

vi.mock('@stamhoofd/migrations-manager', () => ({
    resolveRerunStart: vi.fn(async () => ({
        baseImage: 'stamhoofd-migrations/dev:0009-before',
        startFrom: '0010-failed.js',
        previousChainId: 'old-chain',
        previousCatalog: { version: 1, createdAt: 'now', rootDir: '/repo', hash: 'hash', entries: [] },
    })),
    runMigrationChain: vi.fn(async () => ({ chainId: 'new-chain', results: [] })),
}));

vi.mock('../../config/build-config.js', () => ({
    buildBackendEnv: vi.fn(() => ({ DB_DATABASE: 'stamhoofd-development' })),
}));

describe('MigrationsRerun command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('resolves the predecessor and calls the shared chain runner', async () => {
        const command = new MigrationsRerun([], {} as any);
        (command as any).parse = vi.fn(async () => ({
            flags: {
                env: 'stamhoofd',
                verbose: false,
                chain: 'old-chain',
                from: '0010-failed.ts',
                'tag-prefix': 'stamhoofd-migrations/rerun',
                database: 'stamhoofd-development',
                'continue-on-failure': false,
                'allow-changed-files': true,
                build: 'auto',
                'mysql-image': 'mysql:8.4',
            },
        }));
        (command as any).createContext = vi.fn(async () => ({ rootDir: '/repo', env: 'stamhoofd', verbose: false }));

        await command.run();

        expect(resolveRerunStart).toHaveBeenCalledWith({ chainId: 'old-chain', from: '0010-failed.ts' });
        expect(runMigrationChain).toHaveBeenCalledWith(expect.objectContaining({
            rootDir: '/repo',
            baseImage: 'stamhoofd-migrations/dev:0009-before',
            startFrom: '0010-failed.js',
            previousChainId: 'old-chain',
            tagPrefix: 'stamhoofd-migrations/rerun',
            allowChangedFiles: true,
        }));
    });
});
