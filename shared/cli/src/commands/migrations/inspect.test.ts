import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectMigrationImage } from '@stamhoofd/migrations-manager';
import MigrationsInspect from './inspect.js';

vi.mock('@stamhoofd/migrations-manager', () => ({
    inspectMigrationImage: vi.fn(async () => details()),
}));

describe('MigrationsInspect command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('prints a concise summary by default', async () => {
        const output = await runCommand({ json: false, catalog: false, labels: false });

        expect(output).toContain('Migration image');
        expect(output).toContain('chain-1');
        expect(output).toContain('0001-create.js');
        expect(output).not.toContain('"metadata"');
    });

    it('prints full JSON when requested', async () => {
        const output = await runCommand({ json: true, catalog: false, labels: false });

        expect(output).toContain('"metadata"');
        expect(output).toContain('"manifest"');
    });

    it('includes catalog details when requested', async () => {
        const output = await runCommand({ json: false, catalog: true, labels: false });

        expect(output).toContain('Catalog catalog-hash');
        expect(output).toContain('models');
        expect(output).toContain('0001-create.js');
    });

    it('includes labels when requested', async () => {
        const output = await runCommand({ json: false, catalog: false, labels: true });

        expect(output).toContain('Image labels');
        expect(output).toContain('be.stamhoofd.migrations.chain');
    });
});

async function runCommand(flags: { json: boolean; catalog: boolean; labels: boolean }): Promise<string> {
    const messages: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
        messages.push(typeof message === 'string' ? message : '');
    });
    const command = new MigrationsInspect([], {} as any);
    (command as any).parse = vi.fn(async () => ({ flags: { image: 'image:tag', verbose: false, ...flags } }));
    await command.run();
    return messages.join('\n');
}

function details() {
    return {
        image: 'image:tag',
        metadata: {
            id: 'image-id',
            repoTags: ['image:tag'],
            labels: {
                'be.stamhoofd.migrations.chain': 'chain-1',
                'be.stamhoofd.migrations.database': 'stamhoofd-development',
            },
        },
        manifest: {
            version: 1,
            chainId: 'chain-1',
            role: 'migration',
            status: 'success',
            database: 'stamhoofd-development',
            image: 'image:tag',
            parentImage: 'image:previous',
            migration: {
                index: 0,
                id: '0001-create.js',
                normalizedFile: '0001-create.js',
                sourcePath: '/repo/backend/shared/models/src/migrations/0001-create.ts',
                package: 'models',
                sha256: 'migration-hash',
            },
            catalog: {
                version: 1,
                createdAt: '2026-06-05T09:00:00.000Z',
                rootDir: '/repo',
                hash: 'catalog-hash',
                entries: [
                    {
                        index: 0,
                        id: '0001-create.js',
                        normalizedFile: '0001-create.js',
                        sourcePath: '/repo/backend/shared/models/src/migrations/0001-create.ts',
                        package: 'models',
                        sha256: 'migration-hash',
                    },
                ],
            },
            startedAt: '2026-06-05T09:00:00.000Z',
            finishedAt: '2026-06-05T09:01:00.000Z',
        },
    };
}
