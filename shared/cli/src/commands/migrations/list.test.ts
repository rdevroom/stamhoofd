import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listMigrationImages } from '@stamhoofd/migrations-manager';
import MigrationsList from './list.js';

vi.mock('@stamhoofd/migrations-manager', () => ({
    createMigrationCatalog: vi.fn(async () => ({ entries: [] })),
    listMigrationImages: vi.fn(async () => []),
}));

describe('MigrationsList command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('prints a message when no chains exist', async () => {
        const messages: string[] = [];
        vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
            messages.push(typeof message === 'string' ? message : '');
        });
        const command = new MigrationsList([], {} as any);
        (command as any).parse = vi.fn(async () => ({ flags: { verbose: false } }));

        await command.run();

        expect(messages.join('\n')).toContain('No migration image chains found.');
    });

    it('prints chain context in a table', async () => {
        vi.mocked(listMigrationImages).mockResolvedValueOnce([
            {
                chainId: 'parent-chain',
                status: 'base',
                images: [
                    image('parent-base-id', 'stamhoofd-migrations/dev', 'base', {
                        'be.stamhoofd.migrations.role': 'base',
                        'be.stamhoofd.migrations.status': 'base',
                        'be.stamhoofd.migrations.database': 'stamhoofd-development',
                    }),
                ],
                base: image('parent-base-id', 'stamhoofd-migrations/dev', 'base', {
                    'be.stamhoofd.migrations.role': 'base',
                    'be.stamhoofd.migrations.status': 'base',
                    'be.stamhoofd.migrations.database': 'stamhoofd-development',
                }),
            },
            {
                chainId: 'chain-1',
                parentChainId: 'parent-chain',
                status: 'failed',
                images: [
                    image('base-id', 'stamhoofd-migrations/dev', 'base', {
                        'be.stamhoofd.migrations.role': 'base',
                        'be.stamhoofd.migrations.status': 'base',
                        'be.stamhoofd.migrations.database': 'stamhoofd-development',
                    }),
                    image('success-id', 'stamhoofd-migrations/dev', '0001-create', {
                        'be.stamhoofd.migrations.role': 'migration',
                        'be.stamhoofd.migrations.status': 'success',
                        'be.stamhoofd.migrations.database': 'stamhoofd-development',
                        'be.stamhoofd.migrations.migration': '0001-create.js',
                    }),
                    image('failed-id', 'stamhoofd-migrations/dev', '0002-fail', {
                        'be.stamhoofd.migrations.role': 'migration',
                        'be.stamhoofd.migrations.status': 'failed',
                        'be.stamhoofd.migrations.database': 'stamhoofd-development',
                        'be.stamhoofd.migrations.migration': '0002-fail.js',
                        'be.stamhoofd.migrations.finished-at': '2026-06-05T10:00:00.000Z',
                        'be.stamhoofd.migrations.parent-chain': 'parent-chain',
                    }),
                ],
                base: image('base-id', 'stamhoofd-migrations/dev', 'base', {
                    'be.stamhoofd.migrations.database': 'stamhoofd-development',
                }),
                latestSuccess: image('success-id', 'stamhoofd-migrations/dev', '0001-create', {
                    'be.stamhoofd.migrations.migration': '0001-create.js',
                }),
                failed: image('failed-id', 'stamhoofd-migrations/dev', '0002-fail', {
                    'be.stamhoofd.migrations.database': 'stamhoofd-development',
                    'be.stamhoofd.migrations.migration': '0002-fail.js',
                    'be.stamhoofd.migrations.finished-at': '2026-06-05T10:00:00.000Z',
                    'be.stamhoofd.migrations.parent-chain': 'parent-chain',
                }),
            },
        ]);
        const messages: string[] = [];
        vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
            messages.push(typeof message === 'string' ? message : '');
        });
        const command = new MigrationsList([], {} as any);
        (command as any).parse = vi.fn(async () => ({ flags: { verbose: false } }));

        await command.run();

        const output = messages.join('\n');
        expect(output).toContain('Migration image chains');
        expect(output).toContain('chain-1');
        expect(output).toContain('Failed');
        expect(output).toContain('0001-create.js');
        expect(output).toContain('0002-fail');
        expect(output).toContain('parent-chain');
    });
});

function image(id: string, repository: string, tag: string, labels: Record<string, string>) {
    return { id, repository, tag, labels };
}
