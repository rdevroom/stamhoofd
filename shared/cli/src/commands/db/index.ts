import { Command } from '@oclif/core';
import { showHelp } from '../../runtime/show-help.js';

export default class Db extends Command {
    static summary = 'Inspect and migrate local databases';
    static description = 'Use these commands to inspect or migrate the local database for the selected environment and instance.';
    static examples = [
        'stam db shell --env keeo',
        'stam db migrate --name feature-payments',
    ];

    async run(): Promise<void> {
        await showHelp(this.config, ['db']);
    }
}
