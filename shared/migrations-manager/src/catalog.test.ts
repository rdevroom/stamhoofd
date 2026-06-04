import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compareCatalogs, createMigrationCatalog, normalizeMigrationFile, selectMigrations } from './catalog.js';

let root: string;

describe('migration catalog', () => {
    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'stamhoofd-catalog-'));
        await writeMigration('backend/shared/models/src/migrations/002-models.sql', 'SELECT 2;');
        await writeMigration('backend/shared/models/src/migrations/001-models.ts', 'export default {};');
        await writeMigration('backend/shared/email/migrations/003-email.sql', 'SELECT 3;');
        await writeMigration('backend/app/api/src/migrations/004-api.ts', 'export default {};');
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it('discovers migrations in models, email, api order and normalizes TypeScript names', async () => {
        const catalog = await createMigrationCatalog(root);

        expect(catalog.entries.map(entry => entry.normalizedFile)).toEqual([
            '001-models.js',
            '002-models.sql',
            '003-email.sql',
            '004-api.js',
        ]);
        expect(catalog.entries.map(entry => entry.package)).toEqual(['models', 'models', 'email', 'api']);
        expect(catalog.hash).toHaveLength(64);
    });

    it('detects changed migration contents', async () => {
        const previous = await createMigrationCatalog(root);
        await writeMigration('backend/shared/email/migrations/003-email.sql', 'SELECT 33;');

        const current = await createMigrationCatalog(root);

        expect(compareCatalogs(previous, current)).toEqual([
            expect.objectContaining({ normalizedFile: '003-email.sql', status: 'changed' }),
        ]);
    });

    it('selects rerun migrations from the requested migration', async () => {
        const catalog = await createMigrationCatalog(root);

        expect(selectMigrations(catalog, '003-email.sql').map(entry => entry.normalizedFile)).toEqual([
            '003-email.sql',
            '004-api.js',
        ]);
    });

    it('normalizes only TypeScript migration extensions', () => {
        expect(normalizeMigrationFile('migration.ts')).toBe('migration.js');
        expect(normalizeMigrationFile('migration.sql')).toBe('migration.sql');
    });
});

async function writeMigration(relativePath: string, contents: string): Promise<void> {
    const file = path.join(root, relativePath);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents);
}
