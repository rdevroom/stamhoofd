import { createRequire } from 'node:module';

import { Column, Database, DatabaseInstance, Migration } from '@simonbackx/simple-database';
import { Version } from '@stamhoofd/structures';

Column.setJSONVersion(Version);
process.env.TZ = 'UTC';

const require = createRequire(import.meta.url);

export type RunSingleMigrationOptions = {
    file: string;
    name: string;
};

export async function runSingleMigration(options: RunSingleMigrationOptions): Promise<void> {
    if (!STAMHOOFD.DB_DATABASE) {
        throw new Error('STAMHOOFD.DB_DATABASE is not set');
    }
    if (new Date().getTimezoneOffset() !== 0) {
        throw new Error('Process should always run in UTC timezone');
    }

    await Database.reload({});
    await createDatabaseIfNeeded(STAMHOOFD.DB_DATABASE);
    await runSetupMigration();

    if (await isMigrationExecuted(options.name)) {
        console.log(`Migration ${normalizeMigrationFile(options.name)} was already executed, skipping.`);
        await Database.reload({});
        return;
    }

    const migration = await Migration.getMigration(options.file);
    if (!migration) {
        throw new Error(`Could not load migration: ${options.file}`);
    }

    await migration.up();
    await markMigrationAsExecuted(options.name);
    await Database.reload({});
}

async function createDatabaseIfNeeded(database: string): Promise<void> {
    const globalDatabase = new DatabaseInstance({ database: null });
    await globalDatabase.statement('CREATE DATABASE IF NOT EXISTS `' + database + '` DEFAULT CHARACTER SET = `utf8mb4` DEFAULT COLLATE = `utf8mb4_0900_ai_ci`');
}

async function runSetupMigration(): Promise<void> {
    const setupMigrationPath = require.resolve('@simonbackx/simple-database/migrations/000000000-setup-migrations.sql');
    const setupMigration = await Migration.getMigration(setupMigrationPath);
    if (!setupMigration) {
        throw new Error('Setup migration missing');
    }
    await setupMigration.up();
    await markMigrationAsExecuted('000000000-setup-migrations.sql');
}

async function markMigrationAsExecuted(file: string): Promise<void> {
    const normalized = normalizeMigrationFile(file);
    await Database.statement('INSERT IGNORE INTO `migrations` (`file`, `executedOn`) VALUES (?, NOW())', [normalized]);
}

async function isMigrationExecuted(file: string): Promise<boolean> {
    const normalized = normalizeMigrationFile(file);
    const [rows] = await Database.select('SELECT COUNT(*) AS count FROM `migrations` WHERE `file` = ? LIMIT 1', [normalized]);
    return Number(rows[0]?.['']?.count ?? 0) > 0;
}

function normalizeMigrationFile(file: string): string {
    return file.replace(/\.ts$/, '.js');
}
