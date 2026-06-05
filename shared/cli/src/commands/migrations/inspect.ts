import { createMigrationCatalog, inspectMigrationImage, listMigrationImages } from '@stamhoofd/migrations-manager';
import type { ImageSummary, MigrationCatalogSnapshot, MigrationImageDetails, MigrationImageManifest, MigrationImageOverview, MigrationTimingPhase } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { formatTable } from '../../runtime/ux.js';
import { formatDuration, formatExactTime, formatMigrationLabel, formatMigrationProgress, formatRelativeTime, formatStatusColor, friendlyMigrationName } from '../../migrations/format.js';
import { chainDisplayName, createChainProgress, imageReference } from '../../migrations/progress.js';
import { selectChain, selectImageFromChain } from '../../migrations/prompts.js';

export default class MigrationsInspect extends BaseCommand {
    static summary = 'Inspect a migration image';
    static flags = {
        ...BaseCommand.verboseFlags,
        image: Flags.string({ description: 'Image tag or id to inspect' }),
        chain: Flags.string({ description: 'Chain id to inspect as an overview' }),
        json: Flags.boolean({ description: 'Print full inspection details as JSON', default: false }),
        catalog: Flags.boolean({ description: 'Include the stored migration catalog summary', default: false }),
        labels: Flags.boolean({ description: 'Include image labels', default: false }),
        logs: Flags.boolean({ description: 'Print migration logs', default: false }),
        'logs-lines': Flags.integer({ description: 'Number of log lines to print', default: 20 }),
        timings: Flags.boolean({ description: 'Include timing summary for a chain', default: false }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsInspect);
        const context = await this.createContext(flags);
        const catalog = await createMigrationCatalog(context.rootDir);
        if (flags.chain) {
            console.log(await formatChainOverview(flags.chain, catalog, flags.timings));
            return;
        }
        const chains = await listMigrationImages();
        if (!flags.image && process.stdin.isTTY) {
            const action = await import('@inquirer/prompts').then(({ select }) => select({
                message: 'What do you want to inspect?',
                choices: [
                    { name: 'Chain overview', value: 'chain' as const },
                    { name: 'Failed image', value: 'failed' as const },
                    { name: 'Last successful migration', value: 'latest' as const },
                    { name: 'Base image', value: 'base' as const },
                    { name: 'Browse chain log', value: 'browse' as const },
                ],
            }));
            if (action === 'chain') {
                const chain = await selectChain(chains, 'Which chain do you want to inspect?', undefined, catalog);
                console.log(await formatChainOverview(chain, catalog, flags.timings));
                return;
            }
            const selected = action === 'browse'
                ? await selectImageFromChain(chains, { message: 'Which chain contains the image you want to inspect?', catalog })
                : await selectFixedActionChain(chains, catalog);
            const picked = action === 'failed' ? selected.chain.failed : action === 'latest' ? selected.chain.latestSuccess : action === 'base' ? selected.chain.base : selected.image;
            if (!picked) {
                throw new Error(`No ${action} image is available in chain ${selected.chain.chainId}.`);
            }
            const details = await inspectMigrationImage({ image: imageReference(picked) });
            console.log(formatDetails(details, { catalog: flags.catalog, labels: flags.labels, logs: flags.logs, logLines: flags['logs-lines'] }));
            return;
        }
        const image = flags.image ?? imageReference((await selectImageFromChain(chains, { message: 'Which chain contains the image you want to inspect?', catalog })).image);
        const details = await inspectMigrationImage({ image });
        if (flags.json) {
            console.log(JSON.stringify(details, null, 4));
            return;
        }
        console.log(formatDetails(details, { catalog: flags.catalog, labels: flags.labels, logs: flags.logs, logLines: flags['logs-lines'] }));
    }
}

async function selectFixedActionChain(chains: MigrationImageOverview[], catalog: MigrationCatalogSnapshot): Promise<{ chain: MigrationImageOverview; image: undefined }> {
    const chainId = await selectChain(chains, 'Which chain do you want to inspect?', undefined, catalog);
    const chain = chains.find(c => c.chainId === chainId);
    if (!chain) {
        throw new Error(`Migration chain not found: ${chainId}`);
    }
    return { chain, image: undefined };
}

function formatDetails(details: MigrationImageDetails, options: { catalog: boolean; labels: boolean; logs: boolean; logLines: number }): string {
    const manifest = details.manifest;
    const sections = [formatSummary(details, manifest)];
    if ((options.logs || manifest?.status === 'failed') && details.logs) {
        sections.push(formatLogs(details.logs, options.logs ? Number.POSITIVE_INFINITY : options.logLines));
    }
    if (options.catalog) {
        sections.push(formatCatalog(manifest));
    }
    if (options.labels) {
        sections.push(formatLabels(details));
    }
    return sections.join('\n\n');
}

function formatSummary(details: MigrationImageDetails, manifest: MigrationImageManifest | undefined): string {
    const migration = manifest?.migration?.normalizedFile ?? details.metadata.labels['be.stamhoofd.migrations.migration'] ?? 'base';
    const status = manifest?.status ?? details.metadata.labels['be.stamhoofd.migrations.status'] ?? 'unknown';
    const relative = formatRelativeTime(manifest?.finishedAt ?? details.metadata.labels['be.stamhoofd.migrations.finished-at']);
    const headline = status === 'failed'
        ? `This image failed while running "${formatMigrationLabel(migration).split('\n')[0]}" ${relative}.`
        : status === 'success'
            ? `This image successfully applied "${formatMigrationLabel(migration).split('\n')[0]}" ${relative}.`
            : `This image contains a ${formatStatusColor(status).toLowerCase()} migration database.`;
    const rows = [
        ['Image', details.image],
        ['Image ID', details.metadata.id],
        ['Tags', details.metadata.repoTags.length > 0 ? details.metadata.repoTags.join(', ') : '-'],
        ['Chain', manifest?.chainId ?? details.metadata.labels['be.stamhoofd.migrations.chain'] ?? '-'],
        ['Database', manifest?.database ?? details.metadata.labels['be.stamhoofd.migrations.database'] ?? '-'],
        ['Status', formatStatusColor(status)],
        ['Migration', migration],
        ['Parent image', manifest?.parentImage ?? details.metadata.labels['be.stamhoofd.migrations.parent-image'] ?? '-'],
        ['Parent chain', manifest?.previousChainId ?? details.metadata.labels['be.stamhoofd.migrations.parent-chain'] ?? '-'],
        ['Started at', formatExactTime(manifest?.startedAt ?? details.metadata.labels['be.stamhoofd.migrations.started-at'])],
        ['Finished at', formatExactTime(manifest?.finishedAt ?? details.metadata.labels['be.stamhoofd.migrations.finished-at'])],
        ['Duration', formatDuration(manifest?.startedAt, manifest?.finishedAt)],
        ['Catalog SHA-256', manifest?.catalog?.hash ?? details.metadata.labels['be.stamhoofd.migrations.catalog-sha256'] ?? '-'],
        ['Error', manifest?.error ?? '-'],
    ];
    const nextSteps = status === 'failed'
        ? `Next steps:\n  yarn stam migrations inspect --image ${details.image} --logs\n  yarn stam migrations rerun --chain ${manifest?.chainId ?? '<chain-id>'}`
        : `Next steps:\n  yarn stam migrations list\n  yarn stam migrations cleanup --chain ${manifest?.chainId ?? '<chain-id>'}`;
    return `${headline}\n\n${formatTable(['Field', 'Value'], rows, { title: 'Migration image' })}\n\n${nextSteps}`;
}

async function formatChainOverview(chainId: string, catalog: MigrationCatalogSnapshot, includeTimings: boolean): Promise<string> {
    const chains = await listMigrationImages();
    const chain = chains.find(c => c.chainId === chainId);
    if (!chain) {
        throw new Error(`Migration chain not found: ${chainId}`);
    }
    const progress = createChainProgress(chain, catalog);
    const display = chainDisplayName(chain);
    const lines = [
        `Chain ${display.primary}`,
        `${display.secondary}`,
        `${formatStatusColor(chain.status)}, ${formatMigrationProgress(progress.completed, progress.total)} migrations, updated ${formatRelativeTime(progress.latest?.labels['be.stamhoofd.migrations.finished-at'] ?? progress.latest?.createdAt)}`,
        '',
        ...formatChainGraph(chain, catalog),
    ];
    if (progress.next) {
        lines.push('', 'Next:', `○  ${formatMigrationProgress(progress.next.index + 1, progress.total)}  Not run  ${friendlyMigrationName(progress.next.normalizedFile)}`, `│             ${progress.next.normalizedFile}`);
    }
    if (includeTimings) {
        lines.push('', await formatTimingSummary(chain));
    }
    return lines.join('\n');
}

async function formatTimingSummary(chain: MigrationImageOverview): Promise<string> {
    const migrationImages = chain.images.filter(image => image.labels['be.stamhoofd.migrations.role'] === 'migration');
    const details = await Promise.all(migrationImages.map(image => inspectMigrationImage({ image: imageReference(image) })));
    const timed = details
        .map((detail) => {
            const migration = detail.manifest?.migration?.normalizedFile ?? detail.metadata.labels['be.stamhoofd.migrations.migration'];
            const totalMs = detail.manifest?.timings?.totalMs;
            return migration && typeof totalMs === 'number'
                ? { migration, totalMs, phases: detail.manifest?.timings?.phases ?? [] }
                : undefined;
        })
        .filter((item): item is { migration: string; totalMs: number; phases: MigrationTimingPhase[] } => item !== undefined);

    if (timed.length === 0) {
        return 'Timings: no timing data available in this chain.';
    }

    const phaseTotals = new Map<string, { totalMs: number; count: number }>();
    for (const migration of timed) {
        for (const phase of migration.phases) {
            const current = phaseTotals.get(phase.name) ?? { totalMs: 0, count: 0 };
            phaseTotals.set(phase.name, { totalMs: current.totalMs + phase.durationMs, count: current.count + 1 });
        }
    }

    const slowestPhases = [...phaseTotals.entries()]
        .sort((a, b) => b[1].totalMs - a[1].totalMs)
        .slice(0, 8)
        .map(([name, value]) => [name, formatMs(value.totalMs), formatMs(value.totalMs / value.count), String(value.count)]);
    const slowestMigrations = timed
        .sort((a, b) => b.totalMs - a.totalMs)
        .slice(0, 8)
        .map(item => [item.migration, formatMs(item.totalMs)]);

    return [
        formatTable(['Phase', 'Total', 'Average', 'Count'], slowestPhases, { title: 'Slowest timing phases' }),
        formatTable(['Migration', 'Total'], slowestMigrations, { title: 'Slowest migrations' }),
    ].join('\n\n');
}

function formatMs(ms: number): string {
    if (ms >= 1000) {
        return `${(ms / 1000).toFixed(2)}s`;
    }
    return `${Math.round(ms)}ms`;
}

function formatChainGraph(chain: MigrationImageOverview, catalog: MigrationCatalogSnapshot): string[] {
    const migrationImages = chain.images.filter(image => image.labels['be.stamhoofd.migrations.role'] === 'migration');
    const current = chain.failed ?? chain.latestSuccess;
    const currentIndex = current ? Number(current.labels['be.stamhoofd.migrations.migration-index'] ?? 0) : -1;
    const start = Math.max(0, currentIndex - 9);
    const visible = migrationImages.filter((image) => {
        const index = Number(image.labels['be.stamhoofd.migrations.migration-index'] ?? -1);
        return index >= start && index <= currentIndex;
    }).reverse();
    const lines = visible.flatMap((image, visibleIndex) => graphImageLines(image, catalog, visibleIndex === 0));
    if (start > 0) {
        lines.push('│', `○  ...    ${start} earlier migrations hidden`);
    }
    if (chain.base) {
        lines.push('│', `◇  base   ${formatStatusColor('base')}  Empty database`);
    }
    return lines.length > 0 ? lines : ['◇  base   Empty database'];
}

function graphImageLines(image: ImageSummary, catalog: MigrationCatalogSnapshot, current: boolean): string[] {
    const index = Number(image.labels['be.stamhoofd.migrations.migration-index'] ?? 0);
    const migration = image.labels['be.stamhoofd.migrations.migration'] ?? 'base';
    const marker = current ? '@' : '○';
    return [
        `${marker}  ${formatMigrationProgress(index + 1, catalog.entries.length)}  ${formatStatusColor(image.labels['be.stamhoofd.migrations.status'] ?? '')}  ${friendlyMigrationName(migration)}`,
        `│             ${migration}`,
    ];
}

function formatCatalog(manifest: MigrationImageManifest | undefined): string {
    if (!manifest?.catalog) {
        return 'Catalog: not available';
    }
    const rows = manifest.catalog.entries.map(entry => [String(entry.index + 1), entry.package, entry.normalizedFile, entry.sha256]);
    return formatTable(['#', 'Package', 'Migration', 'SHA-256'], rows, { title: `Catalog ${manifest.catalog.hash}` });
}

function formatLogs(logs: string, maxLines: number): string {
    const lines = logs.trimEnd().split('\n');
    const selected = Number.isFinite(maxLines) ? lines.slice(-maxLines) : lines;
    return `Log preview:\n${selected.map(line => `  ${line}`).join('\n')}`;
}

function formatLabels(details: MigrationImageDetails): string {
    const labels = Object.entries(details.metadata.labels)
        .map(([key, value]) => [key, String(value)])
        .sort(([a], [b]) => a.localeCompare(b));
    if (labels.length === 0) {
        return 'Labels: none';
    }
    return formatTable(['Label', 'Value'], labels, { title: 'Image labels' });
}
