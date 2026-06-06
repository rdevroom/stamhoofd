import { createBaseImage, createCliContainerRuntime, listMigrationImages } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { select } from '@inquirer/prompts';
import { BaseCommand } from '../../base-command.js';
import { checkGzipSupport } from '../../runtime/compression.js';
import { checkGpgSupport, resolveGpgDecryptOptions } from '../../runtime/gpg.js';
import { promptFailure } from '../../runtime/ux.js';
import { readMigrationChoiceCache, writeMigrationChoiceCache } from '../../migrations/cache.js';
import { createBaseProgressOutput } from '../../migrations/base-progress.js';
import { improveImageConflictError } from '../../migrations/errors.js';
import { isInteractive, resolveOptionalInputFlag, resolveTextFlag } from '../../migrations/prompts.js';
import { migrationDatabaseName } from '../../migrations/progress.js';

export default class MigrationsCreateBase extends BaseCommand {
    static summary = 'Create a base database image from a database export';

    static flags = {
        ...BaseCommand.verboseFlags,
        dump: Flags.string({ description: 'Path to a .sql, .sql.gz, .sql.gpg, or .sql.gz.gpg file. Omit to create an empty database base image.' }),
        database: Flags.string({ description: 'Database name to create and import into', hidden: true }),
        tag: Flags.string({ description: 'Local image tag to create' }),
        'mysql-image': Flags.string({ description: 'MySQL image to use' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsCreateBase);
        const context = await this.createContext(flags);
        const cache = await readMigrationChoiceCache(context.rootDir);
        const runtime = await createCliContainerRuntime();
        const chains = await listMigrationImages({ runtime });
        const database = flags.database ?? migrationDatabaseName;
        printExplanation();
        const name = await resolveTextFlag(flags.tag, 'tag', 'Which name should this migration base use?', defaultBaseName());
        const tag = imageReferenceFromName(name);
        const dump = await resolveBaseDump(flags.dump);
        const format = dump ? dumpFormat(dump) : undefined;
        if (dump) {
            await validateDumpRequirements(dump, context);
        }
        const mysqlImage = flags['mysql-image'];
        const chainId = !chains.some(chain => chain.chainId === name) ? name : undefined;
        const decryptOptions = dump && format?.encrypted ? await resolveGpgDecryptOptions({ file: dump, context }) : {};
        const progress = createBaseProgressOutput();
        const result = await createBaseImage({
            rootDir: context.rootDir,
            dump,
            dumpGpgHome: decryptOptions.gpgHome,
            database,
            tag,
            chainId,
            displayName: name,
            mysqlImage,
            verbose: flags.verbose,
            runtime,
            telemetry: true,
            onProgress: progress.onProgress,
        }).catch(error => improveImageConflictError(error, '--tag')).finally(async () => {
            progress.stop();
            await decryptOptions.cleanup?.();
        });
        const tagPrefix = tagPrefixFromTag(tag);
        await writeMigrationChoiceCache(context.rootDir, { ...(mysqlImage ? { mysqlImage } : {}), tagPrefix });
        console.log(`Chain: ${result.chainId}`);
        console.log('The Docker/Podman tag points to this one image. The chain id groups this base and future migration images.');
        if (result.dumpSha256) {
            console.log(`Dump SHA-256: ${result.dumpSha256}`);
        } else {
            console.log('Created empty database base image.');
        }
        console.log(`Detected applied migrations: ${result.manifest.baseMigrationCount ?? 0}/${result.manifest.baseMigrationTotal ?? 0}`);
        console.log('\nNext step:');
        console.log(`  yarn stam migrations apply --base ${result.image} --tag-prefix ${tagPrefix}`);
    }
}

const importDatabaseExport = '__stamhoofd_import_database_export__';
const emptyDatabase = '__stamhoofd_empty_database__';

async function resolveBaseDump(flag: string | undefined): Promise<string | undefined> {
    if (flag) {
        return flag;
    }
    if (!isInteractive()) {
        return undefined;
    }

    const source = await select({
        message: 'What should this base image contain?',
        choices: [
            { name: 'Import a database export', value: importDatabaseExport },
            { name: 'Create an empty database', value: emptyDatabase },
        ],
    });
    if (source === emptyDatabase) {
        return undefined;
    }

    return await resolveOptionalInputFlag(undefined, 'Which database export should be imported?');
}

async function validateDumpRequirements(dump: string, context: { verbose: boolean }): Promise<void> {
    const format = dumpFormat(dump);
    printDumpFormat(format);

    if (format.encrypted) {
        const gpg = await checkGpgSupport();
        if (!gpg.ok) {
            promptFailure('GPG database export encryption requirement not met, run `stam setup` for more info.');
            throw new Error('GPG database export encryption requirement not met.');
        }
        if (context.verbose) {
            console.log('GPG is available. Encrypted imports may ask for a private key before importing.');
        }
    }

    if (format.compressed) {
        const gzip = await checkGzipSupport();
        if (!gzip.ok) {
            promptFailure('Gzip database export compression requirement not met, run `stam setup` for more info.');
            throw new Error('Gzip database export compression requirement not met.');
        }
    }
}

function dumpFormat(dump: string): { compressed: boolean; encrypted: boolean } {
    return {
        compressed: /(?:\.sql|\.dump)\.gz(?:\.gpg)?$/i.test(dump),
        encrypted: /(?:\.sql|\.dump)(?:\.gz)?\.gpg$/i.test(dump),
    };
}

function printDumpFormat(format: { compressed: boolean; encrypted: boolean }): void {
    console.log('\nDetected export format:');
    if (!format.compressed && !format.encrypted) {
        console.log('✓ plain SQL');
        return;
    }
    if (format.encrypted) {
        console.log('✓ encrypted with GPG');
    }
    if (format.compressed) {
        console.log('✓ compressed with gzip');
    }
}

function tagPrefixFromTag(tag: string): string {
    const separator = tag.lastIndexOf(':');
    const slash = tag.lastIndexOf('/');
    if (separator <= slash) {
        return tag;
    }
    return tag.slice(0, separator);
}

function printExplanation(): void {
    console.log('This creates a local MySQL base image for migration layers.');
    console.log('The tag is the local Docker/Podman image name. The chain id groups this base and future migration images.');
    console.log('');
}

function defaultBaseName(date = new Date()): string {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}_${pad(date.getMinutes())}_${pad(date.getSeconds())}`;
}

function imageReferenceFromName(name: string): string {
    if (name.includes('/')) {
        return name;
    }
    return `localhost/stamhoofd-migrations/${imageNameSlug(name)}:base`;
}

function imageNameSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'base';
}
