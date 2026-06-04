import { resolveRerunStart, runMigrationChain } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { buildBackendEnv } from '../../config/build-config.js';
import { improveImageConflictError } from './errors.js';

export default class MigrationsRerun extends BaseCommand {
    static summary = 'Rerun migrations from a selected migration';
    static flags = {
        ...BaseCommand.environmentFlags,
        chain: Flags.string({ description: 'Existing chain id', required: true }),
        from: Flags.string({ description: 'Migration filename to rerun from', required: true }),
        'tag-prefix': Flags.string({ description: 'Local tag prefix for the new chain', required: true }),
        database: Flags.string({ description: 'Database name to migrate', required: true }),
        'continue-on-failure': Flags.boolean({ description: 'Continue after a failed migration', default: false }),
        'allow-changed-files': Flags.boolean({ description: 'Allow changed migration files', default: false }),
        build: Flags.string({ description: 'Build behavior', options: ['auto', 'skip', 'force'], default: 'auto' }),
        'mysql-image': Flags.string({ description: 'MySQL image metadata value', default: 'docker.io/library/mysql:8.4' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsRerun);
        const context = await this.createContext(flags);
        const start = await resolveRerunStart({ chainId: flags.chain, from: flags.from });
        const result = await runMigrationChain({
            rootDir: context.rootDir,
            baseImage: start.baseImage,
            tagPrefix: flags['tag-prefix'],
            database: flags.database,
            startFrom: start.startFrom,
            previousChainId: start.previousChainId,
            previousCatalog: start.previousCatalog,
            continueOnFailure: flags['continue-on-failure'],
            allowChangedFiles: flags['allow-changed-files'],
            build: flags.build as 'auto' | 'skip' | 'force',
            mysqlImage: flags['mysql-image'],
            verbose: flags.verbose,
            env: buildBackendEnv(context),
        }).catch(error => improveImageConflictError(error, '--tag-prefix'));
        console.log(`Chain: ${result.chainId}`);
        for (const migration of result.results) {
            console.log(`${migration.status.toUpperCase()} ${migration.migration.normalizedFile} -> ${migration.image}`);
        }
    }
}
