import type { ImageSummary, MigrationCatalogSnapshot, MigrationImageOverview } from '@stamhoofd/migrations-manager';
import chalk from 'chalk';
import { formatMigrationLabel, formatMigrationProgress, formatRelativeTime, formatStatusIcon, friendlyMigrationName, padColumns, truncateVisible } from './format.js';
import { chainDisplayName, createChainProgress, imageReference } from './progress.js';

export function formatImageChoice(image: ImageSummary, catalog?: MigrationCatalogSnapshot): string {
    const index = image.labels['be.stamhoofd.migrations.migration-index'];
    const migration = image.labels['be.stamhoofd.migrations.migration'] ?? 'base';
    const prefix = index !== undefined ? catalog ? formatMigrationProgress(Number(index) + 1, catalog.entries.length) : `#${Number(index) + 1}` : 'base';
    const status = image.labels['be.stamhoofd.migrations.status'] ?? '';
    const updated = formatRelativeTime(image.labels['be.stamhoofd.migrations.finished-at'] ?? image.createdAt);
    return padColumns([prefix, truncateVisible(formatMigrationLabel(migration).replace('\n', '  '), 82), formatStatusIcon(status), updated], [8, 82, 2, 14]);
}

export function formatChainChoice(chain: MigrationImageOverview, catalog: MigrationCatalogSnapshot, selectedLast: boolean): string {
    const progress = createChainProgress(chain, catalog);
    const display = chainDisplayName(chain);
    const next = progress.next ? `${formatMigrationProgress(progress.next.index + 1, progress.total)} ${friendlyMigrationName(progress.next.normalizedFile)}` : '-';
    const last = progress.lastSuccess ? formatImageChoice(progress.lastSuccess, catalog) : '-';
    return padColumns([
        truncateVisible(display.primary, 26),
        truncateVisible(display.secondary, 20),
        formatStatusIcon(chain.status),
        `${formatMigrationProgress(progress.completed, progress.total)} migrations`,
        truncateVisible(`Last ${last}`, 74),
        truncateVisible(`Next ${next}`, 48),
        selectedLast ? chalk.dim('selected last') : '',
    ], [26, 20, 2, 16, 74, 48, 14]);
}

export function formatTagPrefixChoice(prefix: string, chains: MigrationImageOverview[], catalog: MigrationCatalogSnapshot): string {
    const matching = chains.filter(chain => chain.images.some(image => image.repository === prefix));
    const latest = matching[0];
    if (!latest) {
        return padColumns([prefix, chalk.dim('custom or cached prefix')], [36, 32]);
    }
    const progress = createChainProgress(latest, catalog);
    return padColumns([
        prefix,
        formatStatusIcon(latest.status),
        formatMigrationProgress(progress.completed, progress.total),
        chainDisplayName(latest).secondary,
    ], [36, 2, 8, 18]);
}

export function imageReferenceChoice(image: ImageSummary): string {
    return imageReference(image);
}
