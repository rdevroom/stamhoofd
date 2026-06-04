import { createBaseImage } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { readMigrationChoiceCache, writeMigrationChoiceCache } from '../../migrations/cache.js';
import { improveImageConflictError } from '../../migrations/errors.js';
import { resolveOptionalTextFlag, resolveTextFlag } from '../../migrations/prompts.js';

export default class MigrationsCreateBase extends BaseCommand {
    static summary = 'Create a base database image from a plain dump';

    static flags = {
        ...BaseCommand.verboseFlags,
        dump: Flags.string({ description: 'Path to a .dump or .sql file. Omit to create an empty database base image.' }),
        database: Flags.string({ description: 'Database name to create and import into' }),
        tag: Flags.string({ description: 'Local image tag to create' }),
        'mysql-image': Flags.string({ description: 'MySQL image to use' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsCreateBase);
        const context = await this.createContext(flags);
        const cache = await readMigrationChoiceCache(context.rootDir);
        const database = await resolveTextFlag(flags.database, 'database', 'Which database should be created in the base image?', cache.migrations.database);
        const tag = await resolveTextFlag(flags.tag, 'tag', 'Which local image tag should be created?', cache.migrations.tagPrefix ? `${cache.migrations.tagPrefix}:base` : undefined);
        const mysqlImage = await resolveOptionalTextFlag(flags['mysql-image'], 'Which MySQL image should be used?', cache.migrations.mysqlImage ?? 'docker.io/library/mysql:8.4');
        const result = await createBaseImage({
            dump: flags.dump,
            database,
            tag,
            mysqlImage,
            verbose: flags.verbose,
        }).catch(error => improveImageConflictError(error, '--tag'));
        await writeMigrationChoiceCache(context.rootDir, { database, mysqlImage, tagPrefix: tag.replace(/:base$/, '') });
        console.log(`Created base image ${result.image} (${result.imageId})`);
        console.log(`Chain: ${result.chainId}`);
        if (result.dumpSha256) {
            console.log(`Dump SHA-256: ${result.dumpSha256}`);
        } else {
            console.log('Created empty database base image.');
        }
        console.log('\nNext step:');
        console.log(`  yarn stam migrations apply --base ${result.image} --tag-prefix ${tag.replace(/:base$/, '')} --database ${database}`);
    }
}
