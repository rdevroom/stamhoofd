import { Command } from '@oclif/core';
import { showHelp } from '../../runtime/show-help.js';

export default class Migrations extends Command {
    static summary = 'Create, debug, compare, and clean up local migration image chains';
    static description = 'Use these workflow commands to create a base database image, apply migrations as image layers, inspect failures and logs, rerun from a failed migration, compare images, and remove old local migration images.';
    static examples = [
        'Start from an empty database:',
        'stam migrations create-base',
        'stam migrations apply',
        'Start from a dump:',
        'stam migrations create-base --dump ~/Downloads/stamhoofd-development.dump --database stamhoofd-development --tag stamhoofd-migrations/dev:base',
        'stam migrations apply --base stamhoofd-migrations/dev:base --tag-prefix stamhoofd-migrations/dev --database stamhoofd-development',
        'Debug a failed migration:',
        'stam migrations list',
        'stam migrations inspect --image <failed-image> --logs',
        'stam migrations rerun --chain <chain-id>',
        'Compare images:',
        'stam migrations diff --from <image> --to <image> --database stamhoofd-development',
        'Cleanup old chains:',
        'stam migrations cleanup --chain <chain-id> --dry-run',
    ];

    async run(): Promise<void> {
        await showHelp(this.config, ['migrations']);
    }
}
