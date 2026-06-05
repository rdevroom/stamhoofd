import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createMigrationCatalog, diffMigrationData, diffMigrationSchema, inspectMigrationImage, listMigrationImages } from '@stamhoofd/migrations-manager';
import type { ImageSummary, MigrationDiffResult } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { formatTable } from '../../runtime/ux.js';
import { readMigrationChoiceCache, writeMigrationChoiceCache } from '../../migrations/cache.js';
import { selectDiffImagesFromChain, selectDiffMode } from '../../migrations/prompts.js';
import { migrationDatabaseName } from '../../migrations/progress.js';

export default class MigrationsDiff extends BaseCommand {
    static summary = 'Compare two migration images';
    static description = 'Creates a schema diff by default. Use --data for a row-count data summary.';
    static examples = [
        'stam migrations diff --from stamhoofd-migrations/dev:base --to stamhoofd-migrations/dev:0001-create --database stamhoofd-development',
        'stam migrations diff --data --from <image> --to <image> --database stamhoofd-development',
    ];

    static flags = {
        ...BaseCommand.verboseFlags,
        from: Flags.string({ description: 'Source image tag or id' }),
        to: Flags.string({ description: 'Target image tag or id' }),
        database: Flags.string({ description: 'Database to compare', hidden: true }),
        schema: Flags.boolean({ description: 'Compare schema only', default: false }),
        data: Flags.boolean({ description: 'Compare row-count data summary', default: false }),
        output: Flags.string({ description: 'Diff output file' }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsDiff);
        const context = await this.createContext(flags);
        const cache = await readMigrationChoiceCache(context.rootDir);
        const catalog = await createMigrationCatalog(context.rootDir);
        const chains = (!flags.from || !flags.to) ? await listMigrationImages() : [];
        const selected = (!flags.from || !flags.to) ? await selectDiffImagesFromChain(chains, { lastChainId: cache.migrations.lastChainId, catalog }) : undefined;
        const from = flags.from ?? imageReference(selected!.from);
        const to = flags.to ?? imageReference(selected!.to);
        if (from === to) {
            throw new Error('Cannot compare a migration image against itself. Select a different target image.');
        }
        const database = flags.database ?? await inferDatabase(from, to, selected?.from, selected?.to);
        const modes = await resolveModes(flags.schema, flags.data);
        await writeMigrationChoiceCache(context.rootDir, { database });

        for (const mode of modes) {
            const outputPath = outputPathFor(context.rootDir, flags.output, from, to, mode, modes.length);
            const result = mode === 'data'
                ? await diffMigrationData({ from, to, database, outputPath })
                : await diffMigrationSchema({ from, to, database, outputPath });
            printResult(mode, from, to, result);
            openDiff(result);
        }
    }
}

async function resolveModes(schema: boolean, data: boolean): Promise<Array<'schema' | 'data'>> {
    if (schema && data) {
        return ['schema', 'data'];
    }
    if (schema) {
        return ['schema'];
    }
    if (data) {
        return ['data'];
    }
    const mode = await selectDiffMode();
    return mode === 'both' ? ['schema', 'data'] : [mode];
}

async function inferDatabase(from: string, to: string, fromImage?: ImageSummary, toImage?: ImageSummary): Promise<string> {
    const fromDatabase = databaseFromImage(fromImage) ?? await databaseFromInspect(from);
    const toDatabase = databaseFromImage(toImage) ?? await databaseFromInspect(to);
    if (fromDatabase && toDatabase && fromDatabase !== toDatabase) {
        console.log(`Selected images use different stored database names. Using ${fromDatabase}.`);
    }
    return fromDatabase ?? toDatabase ?? migrationDatabaseName;
}

function databaseFromImage(image: ImageSummary | undefined): string | undefined {
    return image?.labels['be.stamhoofd.migrations.database'];
}

async function databaseFromInspect(image: string): Promise<string | undefined> {
    const details = await inspectMigrationImage({ image });
    return details.manifest?.database ?? details.metadata.labels['be.stamhoofd.migrations.database'];
}

function outputPathFor(rootDir: string, explicit: string | undefined, from: string, to: string, mode: 'schema' | 'data', modeCount: number): string {
    if (explicit && modeCount === 1) {
        return explicit;
    }
    return path.join(rootDir, '.stamhoofd', 'migrations-diffs', `${safeName(from)}-to-${safeName(to)}.${mode}.diff`);
}

function printResult(mode: 'schema' | 'data', from: string, to: string, result: MigrationDiffResult): void {
    console.log(`${mode === 'data' ? 'Data' : 'Schema'} diff: ${from} -> ${to}`);
    if (mode === 'data') {
        const rows = result.preview.split('\n').slice(1).filter(Boolean).map(line => line.split('\t'));
        console.log(formatTable(['Table', 'Before rows', 'After rows', 'Status'], rows, { title: 'Table summary' }));
    } else {
        console.log('\nDiff preview:');
        console.log(result.preview);
    }
    console.log('\nSaved diff:');
    console.log(`  ${result.outputPath}`);
}

function openDiff(result: MigrationDiffResult): void {
    const command = resolveDiffViewer(result);
    if (!command) {
        console.log('\nNo diff viewer found. Open manually:');
        console.log(`  less ${result.outputPath}`);
        return;
    }
    console.log('\nOpening diff viewer:');
    console.log(`  ${[command.command, ...command.args].join(' ')}`);
    const opened = spawnSync(command.command, command.args, { stdio: 'inherit', env: { ...process.env, LESS: process.env.LESS ?? 'FRX' } });
    if (opened.error || (typeof opened.status === 'number' && opened.status !== 0)) {
        console.log('\nDiff viewer failed. Open manually:');
        console.log(`  less ${result.outputPath}`);
    }
}

function resolveDiffViewer(result: MigrationDiffResult): { command: string; args: string[] } | undefined {
    const custom = process.env.STAM_MIGRATIONS_DIFF_VIEWER;
    if (custom) {
        const [command, ...args] = splitCommand(custom);
        if (command) {
            return { command, args: [...args, ...diffArgsFor(command, result)] };
        }
    }
    if (result.beforePath && result.afterPath && commandExists('difft')) {
        return { command: 'difft', args: [result.beforePath, result.afterPath] };
    }
    if (result.outputPath && commandExists('delta')) {
        return { command: 'delta', args: [result.outputPath] };
    }
    if (result.beforePath && result.afterPath && commandExists('diff')) {
        return { command: 'diff', args: ['-u', result.beforePath, result.afterPath] };
    }
    return undefined;
}

function diffArgsFor(command: string, result: MigrationDiffResult): string[] {
    if (result.beforePath && result.afterPath && command !== 'delta') {
        return [result.beforePath, result.afterPath];
    }
    return result.outputPath ? [result.outputPath] : [];
}

function commandExists(command: string): boolean {
    return spawnSync('which', [command], { stdio: 'ignore' }).status === 0;
}

function splitCommand(command: string): string[] {
    return command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)?.map(part => part.replace(/^['"]|['"]$/g, '')) ?? [];
}

function imageReference(image: { id: string; repository: string; tag: string }): string {
    if (image.repository && image.tag && image.repository !== '<none>' && image.tag !== '<none>') {
        return `${image.repository}:${image.tag}`;
    }
    return image.id;
}

function safeName(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}
