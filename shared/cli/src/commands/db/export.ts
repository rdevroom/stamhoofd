import path from 'node:path';
import { Flags } from '@oclif/core';
import { confirm, input, select } from '@inquirer/prompts';
import { BaseCommand } from '../../base-command.js';
import { checkGzipSupport } from '../../runtime/compression.js';
import { currentDatabase, exportDatabase, resolveDatabaseOption } from '../../runtime/database-command-helpers.js';
import { checkGpgEncryptionSupport, resolveGpgRecipient } from '../../runtime/gpg.js';
import { promptFailure } from '../../runtime/ux.js';

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
        const gzipRequirement = await checkGzipSupport();
        const gpgRequirement = await checkGpgEncryptionSupport(context);
        const gzip = await resolveGzipOption({ flag: flags.gzip, output: flags.output, requirementMet: gzipRequirement.ok });
        const encrypt = await resolveEncryptOption({ flag: flags.encrypt, output: flags.output, requirementMet: gpgRequirement.ok });
        const rawOutput = flags.output ?? await input({ message: 'Where should the database export be saved?', default: defaultExportPath(from, gzip, encrypt) });
        const output = normalizeExportPath(rawOutput, gzip, encrypt);
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
    return path.join(process.cwd(), normalizeExportPath(`${database}-${timestamp}`, gzip, encrypt));
}

async function resolveGzipOption(options: { flag: boolean; output?: string; requirementMet: boolean }): Promise<boolean> {
    if (options.flag || outputUsesGzip(options.output)) {
        ensureRequirement(options.requirementMet, 'Compress export with gzip');
        return true;
    }

    return await selectBooleanRequirement({
        message: 'Compress export with gzip?',
        requirementMet: options.requirementMet,
        requirementLabel: 'Compress export with gzip',
    });
}

async function resolveEncryptOption(options: { flag: boolean; output?: string; requirementMet: boolean }): Promise<boolean> {
    if (options.flag || outputUsesGpg(options.output)) {
        ensureRequirement(options.requirementMet, 'Encrypt export with GPG');
        return true;
    }

    return await selectBooleanRequirement({
        message: 'Encrypt export with GPG?',
        requirementMet: options.requirementMet,
        requirementLabel: 'Encrypt export with GPG',
    });
}

async function selectBooleanRequirement(options: { message: string; requirementMet: boolean; requirementLabel: string }): Promise<boolean> {
    return await select({
        message: options.message,
        choices: [
            { name: 'No', value: false },
            options.requirementMet
                ? { name: 'Yes', value: true }
                : { name: 'Yes (requirement not met, run `stam setup` for more info.)', value: true, disabled: true } as { name: string; value: boolean; disabled: boolean },
        ],
    });
}

function ensureRequirement(requirementMet: boolean, label: string): void {
    if (requirementMet) {
        return;
    }

    promptFailure(`${label} requirement not met, run \`stam setup\` for more info.`);
    throw new Error(`${label} requirement not met.`);
}

function normalizeExportPath(output: string, gzip: boolean, encrypt: boolean): string {
    const base = output.replace(/(?:\.sql)?(?:\.gz)?(?:\.gpg)?$/i, '');
    return `${base}.sql${gzip ? '.gz' : ''}${encrypt ? '.gpg' : ''}`;
}

function outputUsesGzip(output: string | undefined): boolean {
    return output !== undefined && /(?:\.sql)?\.gz(?:\.gpg)?$/i.test(output);
}

function outputUsesGpg(output: string | undefined): boolean {
    return output !== undefined && /\.gpg$/i.test(output);
}
