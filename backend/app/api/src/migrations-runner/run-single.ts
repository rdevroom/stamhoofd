import { createRequire } from 'node:module';
import fs from 'node:fs/promises';

import { Column, Database, DatabaseInstance, Migration } from '@simonbackx/simple-database';
import { Version } from '@stamhoofd/structures';

Column.setJSONVersion(Version);
process.env.TZ = 'UTC';

const require = createRequire(import.meta.url);

export type RunSingleMigrationOptions = {
    file: string;
    name: string;
};

export type RunNextMigrationOptions = {
    catalog: string;
};

export type RunMigrationResult = {
    status: 'applied' | 'none';
    name?: string;
};

export const noPendingMigrationsExitCode = 42;
export const appliedMigrationMarker = '__stamhoofd_migration_applied__:';

export async function runSingleMigration(options: RunSingleMigrationOptions): Promise<RunMigrationResult> {
    await prepareDatabase();

    if (await isMigrationExecuted(options.name)) {
        console.log(`Migration ${normalizeMigrationFile(options.name)} was already executed, skipping.`);
        await Database.reload({});
        return { status: 'applied', name: normalizeMigrationFile(options.name) };
    }

    await runMigrationFile(options.file, options.name);
    return { status: 'applied', name: normalizeMigrationFile(options.name) };
}

export async function runNextMigration(options: RunNextMigrationOptions): Promise<RunMigrationResult> {
    await prepareDatabase();
    const catalog = JSON.parse(await fs.readFile(options.catalog, 'utf-8')) as Array<{ name: string; file: string }>;
    const next = await firstPendingMigration(catalog);
    if (!next) {
        console.log('No pending migrations left.');
        await Database.reload({});
        return { status: 'none' };
    }

    console.log(`${appliedMigrationMarker}${normalizeMigrationFile(next.name)}`);
    await runMigrationFile(next.file, next.name);
    return { status: 'applied', name: normalizeMigrationFile(next.name) };
}

async function prepareDatabase(): Promise<void> {
    if (!STAMHOOFD.DB_DATABASE) {
        throw new Error('STAMHOOFD.DB_DATABASE is not set');
    }
    if (new Date().getTimezoneOffset() !== 0) {
        throw new Error('Process should always run in UTC timezone');
    }

    await Database.reload({});
    await createDatabaseIfNeeded(STAMHOOFD.DB_DATABASE);
    await runSetupMigration();
}

async function runMigrationFile(file: string, name: string): Promise<void> {
    const migration = await Migration.getMigration(file);
    if (!migration) {
        throw new Error(`Could not load migration: ${file}`);
    }

    await migration.up();
    await markMigrationAsExecuted(name);
    await Database.reload({});
}

async function firstPendingMigration(catalog: Array<{ name: string; file: string }>): Promise<{ name: string; file: string } | undefined> {
    for (const migration of catalog) {
        if (!await isMigrationExecuted(migration.name)) {
            return migration;
        }
    }
    return undefined;
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
