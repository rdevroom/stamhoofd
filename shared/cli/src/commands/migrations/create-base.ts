import { createBaseImage } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';

export default class MigrationsCreateBase extends BaseCommand {
    static summary = 'Create a base database image from a plain dump';

    static flags = {
        ...BaseCommand.verboseFlags,
        dump: Flags.string({ description: 'Path to a .dump or .sql file. Omit to create an empty database base image.' }),
        database: Flags.string({ description: 'Database name to create and import into', required: true }),
        tag: Flags.string({ description: 'Local image tag to create', required: true }),
        'mysql-image': Flags.string({ description: 'MySQL image to use', default: 'docker.io/library/mysql:8.4' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsCreateBase);
        const result = await createBaseImage({
            dump: flags.dump,
            database: flags.database,
            tag: flags.tag,
            mysqlImage: flags['mysql-image'],
            verbose: flags.verbose,
        });
        console.log(`Created base image ${result.image} (${result.imageId})`);
        console.log(`Chain: ${result.chainId}`);
        if (result.dumpSha256) {
            console.log(`Dump SHA-256: ${result.dumpSha256}`);
        } else {
            console.log('Created empty database base image.');
        }
    }
}
