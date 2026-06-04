import { runMigrationChain } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { buildBackendEnv } from '../../config/build-config.js';

export default class MigrationsApply extends BaseCommand {
    static summary = 'Apply migrations as local image layers';

    static flags = {
        ...BaseCommand.environmentFlags,
        base: Flags.string({ description: 'Base image to start from', required: true }),
        'tag-prefix': Flags.string({ description: 'Local tag prefix for migration layers', required: true }),
        database: Flags.string({ description: 'Database name to migrate', required: true }),
        'continue-on-failure': Flags.boolean({ description: 'Continue after a failed migration', default: false }),
        'allow-changed-files': Flags.boolean({ description: 'Allow changed migration files', default: false }),
        build: Flags.string({ description: 'Build behavior', options: ['auto', 'skip', 'force'], default: 'auto' }),
        'mysql-image': Flags.string({ description: 'MySQL image metadata value', default: 'docker.io/library/mysql:8.4' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsApply);
        const context = await this.createContext(flags);
        const result = await runMigrationChain({
            rootDir: context.rootDir,
            baseImage: flags.base,
            tagPrefix: flags['tag-prefix'],
            database: flags.database,
            continueOnFailure: flags['continue-on-failure'],
            allowChangedFiles: flags['allow-changed-files'],
            build: flags.build as 'auto' | 'skip' | 'force',
            mysqlImage: flags['mysql-image'],
            verbose: flags.verbose,
            env: buildBackendEnv(context),
        });
        console.log(`Chain: ${result.chainId}`);
        for (const migration of result.results) {
            console.log(`${migration.status.toUpperCase()} ${migration.migration.normalizedFile} -> ${migration.image}`);
        }
    }
}
