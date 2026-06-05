import type { ImageSummary, MigrationCatalogSnapshot, MigrationImageOverview } from '@stamhoofd/migrations-manager';

export type ChainProgress = {
    chain: MigrationImageOverview;
    total: number;
    completed: number;
    lastSuccess?: ImageSummary;
    failed?: ImageSummary;
    latest?: ImageSummary;
    next?: {
        index: number;
        normalizedFile: string;
    };
};

export function createChainProgress(chain: MigrationImageOverview, catalog: MigrationCatalogSnapshot): ChainProgress {
    const successes = chain.images.filter(image => image.labels['be.stamhoofd.migrations.status'] === 'success');
    const lastSuccess = chain.latestSuccess ?? successes.at(-1);
    const failed = chain.failed;
    const latest = failed ?? lastSuccess ?? chain.base;
    const completed = lastSuccess ? Number(lastSuccess.labels['be.stamhoofd.migrations.migration-index'] ?? -1) + 1 : 0;
    const nextIndex = failed
        ? Number(failed.labels['be.stamhoofd.migrations.migration-index'] ?? completed)
        : completed;
    const nextEntry = catalog.entries.find(entry => entry.index === nextIndex);
    return {
        chain,
        total: catalog.entries.length,
        completed: Math.max(0, Math.min(completed, catalog.entries.length)),
        lastSuccess,
        failed,
        latest,
        next: nextEntry ? { index: nextEntry.index, normalizedFile: nextEntry.normalizedFile } : undefined,
    };
}

export function imageReference(image: ImageSummary): string {
    if (image.repository && image.tag && image.repository !== '<none>' && image.tag !== '<none>') {
        return `${image.repository}:${image.tag}`;
    }
    return image.id;
}
