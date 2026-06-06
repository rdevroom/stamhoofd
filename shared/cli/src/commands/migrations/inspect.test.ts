import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigrationCatalog, inspectMigrationImage, listMigrationImages } from '@stamhoofd/migrations-manager';
import MigrationsInspect from './inspect.js';

vi.mock('@stamhoofd/migrations-manager', () => ({
    createMigrationCatalog: vi.fn(async () => ({ entries: [] })),
    inspectMigrationImage: vi.fn(async () => details()),
    listMigrationImages: vi.fn(async () => []),
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

    it('prints per-migration timings in chain overview and skips inspect failures', async () => {
        vi.mocked(createMigrationCatalog).mockResolvedValueOnce(catalog());
        vi.mocked(listMigrationImages).mockResolvedValueOnce([chain()]);
        vi.mocked(inspectMigrationImage)
            .mockRejectedValueOnce(new Error('empty stdout'))
            .mockResolvedValueOnce(details({ image: 'localhost/chain:0002-second.js', migration: '0002-second.js', totalMs: 2000 }));
        const messages: string[] = [];
        vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
            messages.push(typeof message === 'string' ? message : '');
        });
        const command = new MigrationsInspect([], {} as any);
        (command as any).parse = vi.fn(async () => ({ flags: { chain: 'chain-1', timings: true, verbose: false, catalog: false, labels: false, logs: false, 'logs-lines': 20 } }));
        (command as any).createContext = vi.fn(async () => ({ rootDir: '/repo', verbose: false }));

        await command.run();

        const output = messages.join('\n');
        expect(output).toContain('Second  2.00s');
        expect(output).toContain('Slowest migrations');
        expect(output).toContain('Timing warnings: skipped 1 image');
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

function details(options: { image?: string; migration?: string; totalMs?: number } = {}) {
    const migration = options.migration ?? '0001-create.js';
    return {
        image: options.image ?? 'image:tag',
        metadata: {
            id: 'image-id',
            repoTags: [options.image ?? 'image:tag'],
            labels: {
                'be.stamhoofd.migrations.chain': 'chain-1',
                'be.stamhoofd.migrations.database': 'stamhoofd-development',
                'be.stamhoofd.migrations.migration': migration,
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
                index: migration.startsWith('0002') ? 1 : 0,
                id: migration,
                normalizedFile: migration,
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
            timings: options.totalMs === undefined ? undefined : {
                totalMs: options.totalMs,
                phases: [{ name: 'run-migration', startedAt: '2026-06-05T09:00:00.000Z', finishedAt: '2026-06-05T09:00:02.000Z', durationMs: options.totalMs, status: 'success' }],
            },
        },
    };
}

function catalog() {
    return {
        version: 1,
        createdAt: '2026-06-05T09:00:00.000Z',
        rootDir: '/repo',
        hash: 'catalog-hash',
        entries: [
            { index: 0, id: '0001-first.js', normalizedFile: '0001-first.js', sourcePath: '/repo/0001-first.ts', package: 'models', sha256: 'hash-1' },
            { index: 1, id: '0002-second.js', normalizedFile: '0002-second.js', sourcePath: '/repo/0002-second.ts', package: 'models', sha256: 'hash-2' },
        ],
    };
}

function chain() {
    const first = image('localhost/chain', '0001-first.js', 0);
    const second = image('localhost/chain', '0002-second.js', 1);
    return {
        chainId: 'chain-1',
        images: [first, second],
        latestSuccess: second,
        status: 'success',
    };
}

function image(repository: string, migration: string, index: number) {
    return {
        id: `image-${index}`,
        repository,
        tag: migration,
        labels: {
            'be.stamhoofd.migrations.role': 'migration',
            'be.stamhoofd.migrations.status': 'success',
            'be.stamhoofd.migrations.chain': 'chain-1',
            'be.stamhoofd.migrations.migration': migration,
            'be.stamhoofd.migrations.migration-index': String(index),
            'be.stamhoofd.migrations.finished-at': '2026-06-05T09:01:00.000Z',
        },
    };
}
