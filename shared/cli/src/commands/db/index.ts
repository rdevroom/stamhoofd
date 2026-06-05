import { Command } from '@oclif/core';
import { showHelp } from '../../runtime/show-help.js';

export default class Db extends Command {
    static summary = 'Inspect, migrate, and manage local databases';
    static description = 'Use these commands to inspect, migrate, copy, move, export, import, or remove local databases for the selected environment and instance.';
    static examples = [
        'stam db shell --env keeo',
        'stam db migrate --name feature-payments',
        'stam db copy --from stamhoofd-development --to stamhoofd-development-backup',
        'stam db move --from stamhoofd-development-backup --to stamhoofd-development-old',
        'stam db export --from stamhoofd-development --gzip --encrypt',
        'stam db import --input backup.sql.gz.gpg --to stamhoofd-development --force',
        'stam db remove --from stamhoofd-development-old',
    ];

    async run(): Promise<void> {
        await showHelp(this.config, ['db']);
    }
}
