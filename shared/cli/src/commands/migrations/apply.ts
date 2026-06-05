import { createBaseImage, createCliContainerRuntime, createMigrationCatalog, detectStaleMigrationOutputs, listMigrationImages, runMigrationChain } from '@stamhoofd/migrations-manager';
import type { ContainerRuntime } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { buildBackendEnv } from '../../config/build-config.js';
import { readMigrationChoiceCache, writeMigrationChoiceCache } from '../../migrations/cache.js';
import { improveImageConflictError } from '../../migrations/errors.js';
import { createMigrationProgressOutput } from '../../migrations/live-progress.js';
import { confirmAction, resolveBuildFlag, resolveTagPrefixFlag, resolveTextFlag, selectBaseImage } from '../../migrations/prompts.js';
import { imageReference, migrationDatabaseName } from '../../migrations/progress.js';

export default class MigrationsApply extends BaseCommand {
    static summary = 'Apply migrations as local image layers';

    static flags = {
        ...BaseCommand.environmentFlags,
        base: Flags.string({ description: 'Base image to start from' }),
        'tag-prefix': Flags.string({ description: 'Local tag prefix for migration layers' }),
        database: Flags.string({ description: 'Database name to migrate', hidden: true }),
        'continue-on-failure': Flags.boolean({ description: 'Continue after a failed migration', default: false }),
        'allow-changed-files': Flags.boolean({ description: 'Allow changed migration files', default: false }),
        build: Flags.string({ description: 'Build behavior', options: ['auto', 'skip', 'force'] }),
        'mysql-image': Flags.string({ description: 'MySQL image metadata value' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsApply);
        const context = await this.createContext(flags);
        const cache = await readMigrationChoiceCache(context.rootDir);
        const catalog = await createMigrationCatalog(context.rootDir);
        const runtime = await createCliContainerRuntime();
        const chains = await listMigrationImages({ runtime });
        const tagPrefix = await resolveTagPrefixFlag(flags['tag-prefix'], chains, cache.migrations.tagPrefix);
        const database = flags.database ?? migrationDatabaseName;
        const mysqlImage = flags['mysql-image'];
        const base = flags.base ?? await resolveBaseImage(context.rootDir, database, tagPrefix, mysqlImage, flags.verbose, catalog, runtime, chains);
        const build = await resolveBuildFlag(flags.build, cache.migrations.build);
        const effectiveBuild = await resolveStaleOutputs(context.rootDir, build);
        const progress = createMigrationProgressOutput();
        const result = await runMigrationChain({
            rootDir: context.rootDir,
            baseImage: base,
            tagPrefix,
            database,
            continueOnFailure: flags['continue-on-failure'],
            allowChangedFiles: flags['allow-changed-files'],
            build: effectiveBuild,
            mysqlImage,
            verbose: flags.verbose,
            env: buildBackendEnv(context),
            runtime,
            catalog,
            onProgress: progress.onProgress,
        }).catch(error => improveImageConflictError(error, '--tag-prefix')).finally(() => progress.stop());
        await writeMigrationChoiceCache(context.rootDir, { tagPrefix, build: effectiveBuild, ...(mysqlImage ? { mysqlImage } : {}) });
        console.log(`Chain: ${result.chainId}`);
        const failed = result.results.find(migration => migration.status === 'failed');
        console.log('\nNext steps:');
        if (failed) {
            console.log(`  yarn stam migrations inspect --image ${failed.image} --logs`);
            console.log(`  yarn stam migrations rerun --chain ${result.chainId}`);
        } else {
            console.log('  yarn stam migrations list');
            const latest = result.results.at(-1);
            if (latest) {
                console.log(`  yarn stam migrations inspect --image ${latest.image}`);
            }
        }
    }
}

async function resolveBaseImage(rootDir: string, database: string, tagPrefix: string, mysqlImage: string | undefined, verbose: boolean, catalog: Awaited<ReturnType<typeof createMigrationCatalog>>, runtime: ContainerRuntime, chains: Awaited<ReturnType<typeof listMigrationImages>>): Promise<string> {
    const selected = await selectBaseImage(chains, catalog);
    if (selected !== 'create') {
        return imageReference(selected);
    }
    const tag = await resolveTextFlag(undefined, 'tag', 'Which local image tag should be created for the new base database? This is the Docker/Podman image name saved locally. It will be used immediately as --base for this apply run, for example localhost/stamhoofd-migrations/manual:base.', `${tagPrefix}:base`);
    const result = await createBaseImage({ rootDir, database, tag, mysqlImage, verbose, runtime }).catch(error => improveImageConflictError(error, '--tag'));
    console.log(`Created base image ${result.image} (${result.imageId})`);
    return result.image;
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
