import { inspectMigrationImage } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';

export default class MigrationsInspect extends BaseCommand {
    static summary = 'Inspect a migration image';
    static flags = {
        ...BaseCommand.verboseFlags,
        image: Flags.string({ description: 'Image tag or id to inspect', required: true }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsInspect);
        const details = await inspectMigrationImage({ image: flags.image });
        console.log(JSON.stringify(details, null, 4));
    }
}
