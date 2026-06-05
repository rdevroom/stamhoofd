import type { ImageSummary, MigrationCatalogSnapshot, MigrationImageOverview } from '@stamhoofd/migrations-manager';
import chalk from 'chalk';

export const migrationDatabaseName = 'stamhoofd-migrations';

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

export function chainDisplayName(chain: MigrationImageOverview): { primary: string; secondary: string } {
    const repository = bestRepository(chain);
    if (!repository) {
        return { primary: chain.chainId, secondary: chalk.dim('no local tag') };
    }
    return { primary: shortRepository(repository), secondary: chalk.dim(chain.chainId) };
}

export function formatChainDisplay(chain: MigrationImageOverview): string {
    const display = chainDisplayName(chain);
    return `${display.primary}\n${display.secondary}`;
}

function bestRepository(chain: MigrationImageOverview): string | undefined {
    const tagged = chain.images.find(image => image.repository && image.repository !== '<none>' && image.tag && image.tag !== '<none>');
    return tagged?.repository;
}

function shortRepository(repository: string): string {
    const parts = repository.split('/').filter(Boolean);
    if (parts.length <= 2) {
        return parts.at(-1) ?? repository;
    }
    return parts.slice(2).join('/');
}
