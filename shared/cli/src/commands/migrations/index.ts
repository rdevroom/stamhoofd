import { Command } from '@oclif/core';
import { showHelp } from '../../runtime/show-help.js';

export default class Migrations extends Command {
    static summary = 'Create and inspect local migration image chains';
    static description = 'Use these commands to create a base database image, apply migrations as image layers, list chains, inspect images, or rerun from a selected migration.';
    static examples = [
        'stam migrations create-base --dump ~/Downloads/stamhoofd-development.dump --database stamhoofd-development --tag stamhoofd-migrations/dev:base',
        'stam migrations apply --base stamhoofd-migrations/dev:base --tag-prefix stamhoofd-migrations/dev --database stamhoofd-development',
        'stam migrations list',
        'stam migrations rerun --chain <chain-id> --from 0010-some-migration.js --tag-prefix stamhoofd-migrations/dev-rerun --database stamhoofd-development',
    ];

    async run(): Promise<void> {
        await showHelp(this.config, ['migrations']);
    }
}
