import { inspectMigrationImage } from '@stamhoofd/migrations-manager';
import type { MigrationImageDetails, MigrationImageManifest } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { formatTable } from '../../runtime/ux.js';
import { formatDuration, formatExactTime, formatMigrationLabel, formatRelativeTime, formatStatus } from '../../migrations/format.js';
import { listMigrationImages } from '@stamhoofd/migrations-manager';
import { selectImageFromChain } from '../../migrations/prompts.js';

export default class MigrationsInspect extends BaseCommand {
    static summary = 'Inspect a migration image';
    static flags = {
        ...BaseCommand.verboseFlags,
        image: Flags.string({ description: 'Image tag or id to inspect' }),
        json: Flags.boolean({ description: 'Print full inspection details as JSON', default: false }),
        catalog: Flags.boolean({ description: 'Include the stored migration catalog summary', default: false }),
        labels: Flags.boolean({ description: 'Include image labels', default: false }),
        logs: Flags.boolean({ description: 'Print migration logs', default: false }),
        'logs-lines': Flags.integer({ description: 'Number of log lines to print', default: 20 }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsInspect);
        const image = flags.image ?? imageReference((await selectImageFromChain(await listMigrationImages(), { message: 'Which chain contains the image you want to inspect?' })).image);
        const details = await inspectMigrationImage({ image });
        if (flags.json) {
            console.log(JSON.stringify(details, null, 4));
            return;
        }
        console.log(formatDetails(details, { catalog: flags.catalog, labels: flags.labels, logs: flags.logs, logLines: flags['logs-lines'] }));
    }
}

function imageReference(image: { id: string; repository: string; tag: string }): string {
    if (image.repository && image.tag && image.repository !== '<none>' && image.tag !== '<none>') {
        return `${image.repository}:${image.tag}`;
    }
    return image.id;
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
            : `This image contains a ${formatStatus(status).toLowerCase()} migration database.`;
    const rows = [
        ['Image', details.image],
        ['Image ID', details.metadata.id],
        ['Tags', details.metadata.repoTags.length > 0 ? details.metadata.repoTags.join(', ') : '-'],
        ['Chain', manifest?.chainId ?? details.metadata.labels['be.stamhoofd.migrations.chain'] ?? '-'],
        ['Database', manifest?.database ?? details.metadata.labels['be.stamhoofd.migrations.database'] ?? '-'],
        ['Status', formatStatus(status)],
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
    const labels = Object.entries(details.metadata.labels).sort(([a], [b]) => a.localeCompare(b));
    if (labels.length === 0) {
        return 'Labels: none';
    }
    return formatTable(['Label', 'Value'], labels, { title: 'Image labels' });
}
