import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getExpectedPlaywrightWorkerCount, getMigrationsHashForTests } from './test-mysql-image.js';

let tempDir: string | undefined;

describe('test mysql image', () => {
    afterEach(async () => {
        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
            tempDir = undefined;
        }
    });

    it('hashes migration paths and contents', async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stamhoofd-cli-migrations-'));
        await writeMigration(tempDir, 'backend/shared/models/src/migrations/1.sql', 'SELECT 1;');
        await writeMigration(tempDir, 'backend/shared/email/migrations/1.sql', 'SELECT 2;');
        await writeMigration(tempDir, 'backend/app/api/src/migrations/1.sql', 'SELECT 3;');

        const originalHash = await getMigrationsHashForTests(tempDir);

        await writeMigration(tempDir, 'backend/app/api/src/migrations/1.sql', 'SELECT 4;');
        expect(await getMigrationsHashForTests(tempDir)).not.toBe(originalHash);

        await fs.rm(path.join(tempDir, 'backend/app/api/src/migrations/1.sql'));
        await writeMigration(tempDir, 'backend/app/api/src/migrations/2.sql', 'SELECT 3;');
        expect(await getMigrationsHashForTests(tempDir)).not.toBe(originalHash);
    });

    it('resolves expected Playwright worker count', () => {
        expect(getExpectedPlaywrightWorkerCount({ ci: false, workers: 3 })).toBe(3);
        expect(getExpectedPlaywrightWorkerCount({ ci: true })).toBe(2);
        expect(getExpectedPlaywrightWorkerCount({ ci: false })).toBe(Math.max(1, Math.floor(os.availableParallelism() / 2)));
    });
});

async function writeMigration(rootDir: string, relativePath: string, contents: string): Promise<void> {
    const filePath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents);
}
