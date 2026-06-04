import path from 'node:path';
import { diffMigrationData, diffMigrationSchema, listMigrationImages } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { formatTable } from '../../runtime/ux.js';
import { readMigrationChoiceCache, writeMigrationChoiceCache } from '../../migrations/cache.js';
import { resolveTextFlag, selectImage } from '../../migrations/prompts.js';

export default class MigrationsDiff extends BaseCommand {
    static summary = 'Compare two migration images';
    static description = 'Creates a schema diff by default. Use --data for a row-count data summary.';
    static examples = [
        'stam migrations diff --from stamhoofd-migrations/dev:base --to stamhoofd-migrations/dev:0001-create --database stamhoofd-development',
        'stam migrations diff --data --from <image> --to <image> --database stamhoofd-development',
    ];

    static flags = {
        ...BaseCommand.verboseFlags,
        from: Flags.string({ description: 'Source image tag or id' }),
        to: Flags.string({ description: 'Target image tag or id' }),
        database: Flags.string({ description: 'Database to compare' }),
        schema: Flags.boolean({ description: 'Compare schema only', default: false }),
        data: Flags.boolean({ description: 'Compare row-count data summary', default: false }),
        output: Flags.string({ description: 'Diff output file' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsDiff);
        const context = await this.createContext(flags);
        const cache = await readMigrationChoiceCache(context.rootDir);
        const chains = (!flags.from || !flags.to) ? await listMigrationImages() : [];
        const from = flags.from ?? await selectImage(chains, 'Compare from which image?');
        const to = flags.to ?? await selectImage(chains, 'Compare to which image?');
        const database = await resolveTextFlag(flags.database, 'database', 'Which database should be compared?', cache.migrations.database);
        const mode = flags.data ? 'data' : 'schema';
        const outputPath = flags.output ?? path.join(context.rootDir, '.stamhoofd', 'migrations-diffs', `${safeName(from)}-to-${safeName(to)}.${mode}.diff`);
        const result = mode === 'data'
            ? await diffMigrationData({ from, to, database, outputPath })
            : await diffMigrationSchema({ from, to, database, outputPath });
        await writeMigrationChoiceCache(context.rootDir, { database });
        console.log(`${mode === 'data' ? 'Data' : 'Schema'} diff: ${from} -> ${to}`);
        if (mode === 'data') {
            const rows = result.preview.split('\n').slice(1).filter(Boolean).map(line => line.split('\t'));
            console.log(formatTable(['Table', 'Before rows', 'After rows', 'Status'], rows, { title: 'Table summary' }));
        } else {
            console.log('\nDiff preview:');
            console.log(result.preview);
        }
        console.log('\nSaved diff:');
        console.log(`  ${result.outputPath}`);
        console.log('\nNext step:');
        console.log(`  less ${result.outputPath}`);
    }
}

function safeName(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}
