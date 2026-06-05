import path from 'node:path';
import { checkbox, input, select } from '@inquirer/prompts';
import { createMigrationCatalog, exportMigrationImageSql, listMigrationImageTables, listMigrationImages, resolveMigrationImageDatabase } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { imageReference, migrationDatabaseName } from '../../migrations/progress.js';
import { isInteractive, selectImageFromChain } from '../../migrations/prompts.js';

export default class MigrationsExport extends BaseCommand {
    static summary = 'Export SQL from a migration image';
    static description = 'Exports all tables or selected tables from a local migration image to a SQL file.';
    static examples = [
        'stam migrations export',
        'stam migrations export --image <image> --all --output .stamhoofd/migrations-exports/export.sql',
        'stam migrations export --image <image> --table members --output members.sql',
    ];

    static flags = {
        ...BaseCommand.verboseFlags,
        image: Flags.string({ description: 'Image tag or id to export from' }),
        table: Flags.string({ description: 'Table to export. Repeat to export multiple tables.', multiple: true }),
        all: Flags.boolean({ description: 'Export all tables', default: false }),
        output: Flags.string({ description: 'SQL output path' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsExport);
        const context = await this.createContext(flags);
        const catalog = await createMigrationCatalog(context.rootDir);
        const selected = flags.image ? undefined : await selectImageFromChain(await listMigrationImages(), { message: 'Which chain contains the image you want to export?', catalog });
        const image = flags.image ?? imageReference(selected!.image);
        const database = await resolveMigrationImageDatabase({ image }) ?? migrationDatabaseName;
        const tables = await resolveTables(image, database, flags.table ?? [], flags.all);
        const outputPath = flags.output ?? await resolveOutputPath(context.rootDir, image, tables);
        const result = await exportMigrationImageSql({ image, database, tables: flags.all ? undefined : tables, outputPath });

        console.log('Exported SQL from:');
        console.log(`  ${image}`);
        if (selected) {
            console.log(`  ${selected.chain.chainId}`);
        }
        console.log('\nDatabase:');
        console.log(`  ${result.database}`);
        console.log('\nTables:');
        for (const table of result.tables) {
            console.log(`  ${table}`);
        }
        console.log('\nSaved SQL:');
        console.log(`  ${result.outputPath}`);
    }
}

async function resolveTables(image: string, database: string, tables: string[], all: boolean): Promise<string[]> {
    if (all) {
        return await listMigrationImageTables({ image, database });
    }
    if (tables.length > 0) {
        return tables;
    }
    if (!isInteractive()) {
        throw new Error('Missing export selection. Pass --all or --table explicitly, or run in an interactive terminal.');
    }
    const mode = await select({
        message: 'What do you want to export?',
        choices: [
            { name: 'All tables', value: 'all' as const },
            { name: 'Select tables', value: 'tables' as const },
        ],
    });
    const available = await listMigrationImageTables({ image, database });
    if (mode === 'all') {
        return available;
    }
    return await checkbox({
        message: 'Which tables do you want to export?',
        choices: available.map(table => ({ name: table, value: table })),
        required: true,
    });
}

async function resolveOutputPath(rootDir: string, image: string, tables: string[]): Promise<string> {
    const defaultPath = path.join(rootDir, '.stamhoofd', 'migrations-exports', `${safeName(image)}${tables.length === 1 ? `-${safeName(tables[0])}` : ''}.sql`);
    if (!isInteractive()) {
        return defaultPath;
    }
    return await input({ message: 'Where should the SQL be saved?', default: defaultPath });
}

function safeName(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
}
