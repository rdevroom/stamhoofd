import path from 'node:path';
import { Flags } from '@oclif/core';
import { confirm, input } from '@inquirer/prompts';
import { BaseCommand } from '../../base-command.js';
import { currentDatabase, exportDatabase, resolveDatabaseOption } from '../../runtime/database-command-helpers.js';
import { resolveGpgRecipient } from '../../runtime/gpg.js';

export default class DbExport extends BaseCommand {
    static summary = 'Export a local MySQL database';
    static description = 'Stream a local MySQL database export to a SQL file, optionally gzipped and encrypted with GPG.';
    static examples = [
        'stam db export --from stamhoofd-development --output backup.sql.gz --gzip',
        'stam db export --gzip --encrypt --recipient you@example.com',
    ];

    static flags = {
        ...BaseCommand.instanceFlags,
        from: Flags.string({ description: 'Database name to export from' }),
        output: Flags.string({ char: 'o', description: 'Output file path' }),
        gzip: Flags.boolean({ default: false, description: 'Compress the export with gzip' }),
        encrypt: Flags.boolean({ default: false, description: 'Encrypt the export with GPG' }),
        recipient: Flags.string({ description: 'GPG recipient email, key id, or fingerprint' }),
        force: Flags.boolean({ default: false, description: 'Overwrite the output file if it already exists' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(DbExport);
        const context = await this.createContext(flags);
        const current = currentDatabase(context);
        const from = await resolveDatabaseOption({ flag: flags.from, message: 'Select the database to export', current, includeCurrent: true });
        const gzip = flags.gzip || flags.output?.endsWith('.gz') || flags.output?.includes('.gz.') || false;
        const encrypt = flags.encrypt || flags.output?.endsWith('.gpg') || false;
        const output = flags.output ?? await input({ message: 'Where should the database export be saved?', default: defaultExportPath(from, gzip, encrypt) });
        const recipient = encrypt ? await resolveGpgRecipient({ flag: flags.recipient, context }) : undefined;

        if (encrypt && !flags.recipient && !(await confirm({ message: `Encrypt export for ${recipient}?`, default: true }))) {
            throw new Error('Database export cancelled.');
        }

        await exportDatabase(from, { output, gzip, encrypt, recipient, force: flags.force, verbose: flags.verbose });
        this.log(`Exported local MySQL database ${from} to ${output}.`);
    }
}

function defaultExportPath(database: string, gzip: boolean, encrypt: boolean): string {
    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
    const extension = `.sql${gzip ? '.gz' : ''}${encrypt ? '.gpg' : ''}`;
    return path.join(process.cwd(), `${database}-${timestamp}${extension}`);
}
