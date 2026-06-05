import { createBaseImage, createCliContainerRuntime, listMigrationImages } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { readMigrationChoiceCache, writeMigrationChoiceCache } from '../../migrations/cache.js';
import { createBaseProgressOutput } from '../../migrations/base-progress.js';
import { improveImageConflictError } from '../../migrations/errors.js';
import { resolveOptionalInputFlag, resolveTextFlag } from '../../migrations/prompts.js';
import { migrationDatabaseName } from '../../migrations/progress.js';

export default class MigrationsCreateBase extends BaseCommand {
    static summary = 'Create a base database image from a plain dump';

    static flags = {
        ...BaseCommand.verboseFlags,
        dump: Flags.string({ description: 'Path to a .dump or .sql file. Omit to create an empty database base image.' }),
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
        const dump = await resolveOptionalInputFlag(flags.dump, 'Which database dump should be imported? Leave empty to create an empty base image.');
        const mysqlImage = flags['mysql-image'];
        const chainId = !chains.some(chain => chain.chainId === name) ? name : undefined;
        const progress = createBaseProgressOutput();
        const result = await createBaseImage({
            rootDir: context.rootDir,
            dump,
            database,
            tag,
            chainId,
            displayName: name,
            mysqlImage,
            verbose: flags.verbose,
            runtime,
            onProgress: progress.onProgress,
        }).catch(error => improveImageConflictError(error, '--tag')).finally(() => progress.stop());
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
