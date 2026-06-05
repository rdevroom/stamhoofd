import { createCliContainerRuntime, detectStaleMigrationOutputs, listMigrationImages, resolveRerunStart, runMigrationChain } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { buildBackendEnv } from '../../config/build-config.js';
import { readMigrationChoiceCache, writeMigrationChoiceCache } from '../../migrations/cache.js';
import { improveImageConflictError } from '../../migrations/errors.js';
import { formatMigrationLabel } from '../../migrations/format.js';
import { confirmAction, isInteractive, resolveBuildFlag, resolveTextFlag, selectChain, selectMigrationFile } from '../../migrations/prompts.js';

export default class MigrationsRerun extends BaseCommand {
    static summary = 'Rerun migrations from a selected migration';
    static flags = {
        ...BaseCommand.environmentFlags,
        chain: Flags.string({ description: 'Existing chain id' }),
        from: Flags.string({ description: 'Migration filename to rerun from' }),
        'tag-prefix': Flags.string({ description: 'Local tag prefix for the new chain' }),
        database: Flags.string({ description: 'Database name to migrate' }),
        'continue-on-failure': Flags.boolean({ description: 'Continue after a failed migration', default: false }),
        'allow-changed-files': Flags.boolean({ description: 'Allow changed migration files', default: false }),
        build: Flags.string({ description: 'Build behavior', options: ['auto', 'skip', 'force'] }),
        'mysql-image': Flags.string({ description: 'MySQL image metadata value' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsRerun);
        const context = await this.createContext(flags);
        const cache = await readMigrationChoiceCache(context.rootDir);
        const runtime = await createCliContainerRuntime();
        const chains = await listMigrationImages({ runtime });
        const chain = flags.chain ?? await selectChain(chains, 'Which chain do you want to rerun?', cache.migrations.lastChainId);
        const selectedChain = chains.find(c => c.chainId === chain);
        const defaultFrom = selectedChain?.failed?.labels['be.stamhoofd.migrations.migration'];
        const catalogFiles = selectedChain?.images.flatMap(image => image.labels['be.stamhoofd.migrations.migration'] ? [image.labels['be.stamhoofd.migrations.migration']] : []) ?? [];
        const from = flags.from ?? (defaultFrom ? await confirmDefaultFrom(defaultFrom) : isInteractive() && catalogFiles.length > 0 ? await selectMigrationFile(catalogFiles) : undefined);
        const tagPrefix = await resolveTextFlag(flags['tag-prefix'], 'tag-prefix', 'Which local tag prefix should the new chain use?', cache.migrations.tagPrefix ? `${cache.migrations.tagPrefix}-rerun` : undefined);
        const database = await resolveTextFlag(flags.database, 'database', 'Which database should be migrated?', cache.migrations.database);
        const build = await resolveBuildFlag(flags.build, cache.migrations.build);
        const mysqlImage = flags['mysql-image'];
        const effectiveBuild = await resolveStaleOutputs(context.rootDir, build);
        const start = await resolveRerunStart({ chainId: chain, from, runtime });
        console.log(`Rerun will start from the image before "${formatMigrationLabel(start.startFrom).split('\n')[0]}".`);
        if (isInteractive() && !await confirmAction('Continue?', true)) {
            throw new Error('Rerun cancelled.');
        }
        const result = await runMigrationChain({
            rootDir: context.rootDir,
            baseImage: start.baseImage,
            tagPrefix,
            database,
            startFrom: start.startFrom,
            previousChainId: start.previousChainId,
            previousCatalog: start.previousCatalog,
            continueOnFailure: flags['continue-on-failure'],
            allowChangedFiles: flags['allow-changed-files'],
            build: effectiveBuild,
            mysqlImage,
            verbose: flags.verbose,
            env: buildBackendEnv(context),
            runtime,
        }).catch(error => improveImageConflictError(error, '--tag-prefix'));
        await writeMigrationChoiceCache(context.rootDir, { database, tagPrefix, build: effectiveBuild, ...(mysqlImage ? { mysqlImage } : {}), lastChainId: chain });
        console.log(`Chain: ${result.chainId}`);
        for (const migration of result.results) {
            console.log(`${migration.status.toUpperCase()} ${formatMigrationLabel(migration.migration.normalizedFile).replace('\n', ' ')} -> ${migration.image}`);
        }
        console.log('\nNext steps:');
        console.log('  yarn stam migrations list');
        const latest = result.results.at(-1);
        if (latest) {
            console.log(`  yarn stam migrations inspect --image ${latest.image}${latest.status === 'failed' ? ' --logs' : ''}`);
        }
    }
}

async function confirmDefaultFrom(file: string): Promise<string> {
    if (!isInteractive()) {
        return file;
    }
    console.log(`Rerun will default to the failed migration "${formatMigrationLabel(file).split('\n')[0]}".`);
    if (await confirmAction('Use this migration?', true)) {
        return file;
    }
    return await selectMigrationFile([file], file);
}

async function resolveStaleOutputs(rootDir: string, build: 'auto' | 'skip' | 'force'): Promise<'auto' | 'skip' | 'force'> {
    if (build !== 'skip') {
        return build;
    }
    const stale = await detectStaleMigrationOutputs(rootDir);
    if (stale.length === 0) {
        return build;
    }
    const preview = stale.slice(0, 3).map(item => `Source: ${item.sourcePath}\nOutput: ${item.compiledPath}`).join('\n\n');
    console.log(`The compiled migration output looks stale or missing.\n\n${preview}\n\nRunning with --build skip may use outdated code.`);
    if (await confirmAction('Rebuild now with --build force?', true)) {
        return 'force';
    }
    if (await confirmAction('Continue anyway?', false)) {
        return build;
    }
    throw new Error('Stopped because compiled migration output is stale or missing.');
}
