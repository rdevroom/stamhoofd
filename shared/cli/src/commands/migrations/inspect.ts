import { inspectMigrationImage } from '@stamhoofd/migrations-manager';
import type { MigrationImageDetails, MigrationImageManifest } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { formatTable } from '../../runtime/ux.js';

export default class MigrationsInspect extends BaseCommand {
    static summary = 'Inspect a migration image';
    static flags = {
        ...BaseCommand.verboseFlags,
        image: Flags.string({ description: 'Image tag or id to inspect', required: true }),
        json: Flags.boolean({ description: 'Print full inspection details as JSON', default: false }),
        catalog: Flags.boolean({ description: 'Include the stored migration catalog summary', default: false }),
        labels: Flags.boolean({ description: 'Include image labels', default: false }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsInspect);
        const details = await inspectMigrationImage({ image: flags.image });
        if (flags.json) {
            console.log(JSON.stringify(details, null, 4));
            return;
        }
        console.log(formatDetails(details, { catalog: flags.catalog, labels: flags.labels }));
    }
}

function formatDetails(details: MigrationImageDetails, options: { catalog: boolean; labels: boolean }): string {
    const manifest = details.manifest;
    const sections = [formatSummary(details, manifest)];
    if (options.catalog) {
        sections.push(formatCatalog(manifest));
    }
    if (options.labels) {
        sections.push(formatLabels(details));
    }
    return sections.join('\n\n');
}

function formatSummary(details: MigrationImageDetails, manifest: MigrationImageManifest | undefined): string {
    return formatTable(['Field', 'Value'], [
        ['Image', details.image],
        ['Image ID', details.metadata.id],
        ['Tags', details.metadata.repoTags.length > 0 ? details.metadata.repoTags.join(', ') : '-'],
        ['Chain', manifest?.chainId ?? details.metadata.labels['be.stamhoofd.migrations.chain'] ?? '-'],
        ['Database', manifest?.database ?? details.metadata.labels['be.stamhoofd.migrations.database'] ?? '-'],
        ['Role', manifest?.role ?? details.metadata.labels['be.stamhoofd.migrations.role'] ?? '-'],
        ['Status', manifest?.status ?? details.metadata.labels['be.stamhoofd.migrations.status'] ?? '-'],
        ['Migration', manifest?.migration?.normalizedFile ?? details.metadata.labels['be.stamhoofd.migrations.migration'] ?? 'base'],
        ['Parent image', manifest?.parentImage ?? details.metadata.labels['be.stamhoofd.migrations.parent-image'] ?? '-'],
        ['Parent chain', manifest?.previousChainId ?? details.metadata.labels['be.stamhoofd.migrations.parent-chain'] ?? '-'],
        ['Started at', manifest?.startedAt ?? details.metadata.labels['be.stamhoofd.migrations.started-at'] ?? '-'],
        ['Finished at', manifest?.finishedAt ?? details.metadata.labels['be.stamhoofd.migrations.finished-at'] ?? '-'],
        ['Catalog SHA-256', manifest?.catalog?.hash ?? details.metadata.labels['be.stamhoofd.migrations.catalog-sha256'] ?? '-'],
        ['Error', manifest?.error ?? '-'],
    ], { title: 'Migration image' });
}

function formatCatalog(manifest: MigrationImageManifest | undefined): string {
    if (!manifest?.catalog) {
        return 'Catalog: not available';
    }
    const rows = manifest.catalog.entries.map(entry => [String(entry.index + 1), entry.package, entry.normalizedFile, entry.sha256]);
    return formatTable(['#', 'Package', 'Migration', 'SHA-256'], rows, { title: `Catalog ${manifest.catalog.hash}` });
}

function formatLabels(details: MigrationImageDetails): string {
    const labels = Object.entries(details.metadata.labels).sort(([a], [b]) => a.localeCompare(b));
    if (labels.length === 0) {
        return 'Labels: none';
    }
    return formatTable(['Label', 'Value'], labels, { title: 'Image labels' });
}
