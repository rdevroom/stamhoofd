import { Flags } from '@oclif/core';
import { input } from '@inquirer/prompts';
import { BaseCommand } from '../../base-command.js';
import { currentDatabase, importDatabase, resolveDatabaseOption } from '../../runtime/database-command-helpers.js';

export default class DbImport extends BaseCommand {
    static summary = 'Import a local MySQL database';
    static description = 'Import a SQL database export, optionally decrypting GPG and decompressing gzip based on the file extension.';
    static examples = [
        'stam db import --input backup.sql.gz --to stamhoofd-development-copy',
        'stam db import --input backup.sql.gz.gpg --to stamhoofd-development --force',
    ];

    static flags = {
        ...BaseCommand.instanceFlags,
        input: Flags.string({ char: 'i', description: 'Input .sql, .sql.gz, .sql.gpg, or .sql.gz.gpg file' }),
        to: Flags.string({ description: 'Database name to import to' }),
        force: Flags.boolean({ default: false, description: 'Drop and recreate the target database if it already exists' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(DbImport);
        const context = await this.createContext(flags);
        const current = currentDatabase(context);
        const inputFile = flags.input ?? await input({
            message: 'Which database export should be imported?',
            validate: value => value.trim().length > 0 || 'Enter an input file path.',
        });
        const to = await resolveDatabaseOption({ flag: flags.to, message: 'Select the database to import to', current, includeCurrent: true, customInput: true });

        await importDatabase(inputFile, to, { force: flags.force, verbose: flags.verbose });
        this.log(`Imported ${inputFile} to local MySQL database ${to}.`);
    }
}
