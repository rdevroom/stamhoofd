import { createBaseImage } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { readMigrationChoiceCache, writeMigrationChoiceCache } from '../../migrations/cache.js';
import { improveImageConflictError } from '../../migrations/errors.js';
import { resolveOptionalTextFlag, resolveTextFlag } from '../../migrations/prompts.js';
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
        const database = flags.database ?? migrationDatabaseName;
        const tag = await resolveTextFlag(flags.tag, 'tag', 'Which Docker/Podman tag should be created for the base image? A tag is a human-readable alias for one local image, like mysql:8.4, localhost/stamhoofd-migrations/manual:base, or localhost/stamhoofd-migrations/manual:latest. Stamhoofd also creates a chain id automatically; the chain groups this base image and later migration images together.', cache.migrations.tagPrefix ? `${cache.migrations.tagPrefix}:base` : undefined);
        const mysqlImage = await resolveOptionalTextFlag(flags['mysql-image'], 'Which MySQL image should be used?', cache.migrations.mysqlImage ?? 'docker.io/library/mysql:8.4');
        const result = await createBaseImage({
            dump: flags.dump,
            database,
            tag,
            mysqlImage,
            verbose: flags.verbose,
        }).catch(error => improveImageConflictError(error, '--tag'));
        await writeMigrationChoiceCache(context.rootDir, { mysqlImage, tagPrefix: tag.replace(/:base$/, '') });
        console.log(`Created base image ${result.image} (${result.imageId})`);
        console.log(`Chain: ${result.chainId}`);
        console.log('The Docker/Podman tag points to this one image. The chain id groups this base and future migration images.');
        if (result.dumpSha256) {
            console.log(`Dump SHA-256: ${result.dumpSha256}`);
        } else {
            console.log('Created empty database base image.');
        }
        console.log('\nNext step:');
        console.log(`  yarn stam migrations apply --base ${result.image} --tag-prefix ${tag.replace(/:base$/, '')}`);
    }
}
