import { createMigrationCatalog, listMigrationImages } from '@stamhoofd/migrations-manager';
import type { ImageSummary, MigrationCatalogSnapshot, MigrationImageOverview } from '@stamhoofd/migrations-manager';
import chalk from 'chalk';
import { BaseCommand } from '../../base-command.js';
import { formatTable } from '../../runtime/ux.js';
import { formatMigrationLabel, formatMigrationProgress, formatRelativeTime, formatStatusColor, friendlyMigrationName } from '../../migrations/format.js';
import { createChainProgress, imageReference } from '../../migrations/progress.js';

export default class MigrationsList extends BaseCommand {
    static summary = 'List local migration image chains';
    static flags = BaseCommand.verboseFlags;

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsList);
        const context = await this.createContext(flags);
        const catalog = await createMigrationCatalog(context.rootDir);
        const chains = await listMigrationImages();
        if (chains.length === 0) {
            console.log('No migration image chains found.');
            return;
        }
        console.log(formatTable(
            ['Chain', 'Status', 'Progress', 'Last success', 'Next migration', 'Updated', 'Next command'],
            chains.map(chain => formatChainRow(chain, catalog)),
            { title: 'Migration image chains' },
        ));
    }
}

function formatChainRow(chain: MigrationImageOverview, catalog: MigrationCatalogSnapshot): string[] {
    const progress = createChainProgress(chain, catalog);
    const latest = progress.latest;
    return [
        chain.chainId,
        formatStatusColor(chain.status),
        `${formatMigrationProgress(progress.completed, progress.total)} migrations`,
        migrationLabel(progress.lastSuccess, catalog),
        progress.next ? `${formatMigrationProgress(progress.next.index + 1, progress.total)} ${friendlyMigrationName(progress.next.normalizedFile)}\n${chalk.dim(progress.next.normalizedFile)}` : '-',
        formatRelativeTime(latest?.labels['be.stamhoofd.migrations.finished-at'] ?? latest?.createdAt),
        nextStep(chain),
    ];
}

function migrationLabel(image: ImageSummary | undefined, catalog: MigrationCatalogSnapshot): string {
    if (!image) {
        return '-';
    }
    const index = image.labels['be.stamhoofd.migrations.migration-index'];
    const prefix = index === undefined ? '' : `${formatMigrationProgress(Number(index) + 1, catalog.entries.length)} `;
    return `${prefix}${formatMigrationLabel(image.labels['be.stamhoofd.migrations.migration'] ?? 'base')}`;
}

function nextStep(chain: MigrationImageOverview): string {
    if (chain.status === 'failed') {
        const failed = chain.failed;
        if (!failed) {
            return `yarn stam migrations inspect --chain ${chalk.underline(chain.chainId)}`;
        }
        return `yarn stam migrations inspect --image ${chalk.underline(imageReference(failed))} --logs\nyarn stam migrations rerun --chain ${chalk.underline(chain.chainId)}`;
    }
    if (chain.status === 'success') {
        const latest = chain.latestSuccess;
        if (!latest) {
            return `yarn stam migrations inspect --chain ${chalk.underline(chain.chainId)}`;
        }
        return `yarn stam migrations diff --from ${chalk.underline(imageReference(latest))}\nyarn stam migrations inspect --image ${chalk.underline(imageReference(latest))}`;
    }
    if (chain.status === 'base') {
        return chain.base ? `yarn stam migrations apply --base ${chalk.underline(imageReference(chain.base))}` : `yarn stam migrations inspect --chain ${chalk.underline(chain.chainId)}`;
    }
    return `yarn stam migrations inspect --chain ${chalk.underline(chain.chainId)}`;
}
