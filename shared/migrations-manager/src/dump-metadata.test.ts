import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanDumpMetadata } from './dump-metadata.js';

let root: string;

describe('scanDumpMetadata', () => {
    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), 'stamhoofd-dump-metadata-'));
    });

    afterEach(async () => {
        await fs.rm(root, { recursive: true, force: true });
    });

    it('counts create table statements in a plain SQL dump', async () => {
        const dump = path.join(root, 'database.dump');
        await fs.writeFile(dump, [
            'CREATE TABLE `users` (`id` varchar(36));',
            'CREATE VIEW `active_users` AS SELECT * FROM `users`;',
            'create table if not exists `members` (`id` varchar(36));',
            'CREATE TEMPORARY TABLE `temporary_members` (`id` varchar(36));',
            'INSERT INTO `users` VALUES (\'1\');',
        ].join('\n'));

        await expect(scanDumpMetadata(dump)).resolves.toEqual({ totalTables: 3 });
    });

    it('returns empty metadata when aborted', async () => {
        const dump = path.join(root, 'database.dump');
        await fs.writeFile(dump, 'CREATE TABLE `users` (`id` varchar(36));\n');
        const controller = new AbortController();
        controller.abort();

        await expect(scanDumpMetadata(dump, { signal: controller.signal })).resolves.toEqual({});
    });
});
