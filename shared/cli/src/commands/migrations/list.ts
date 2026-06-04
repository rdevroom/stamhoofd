import { listMigrationImages } from '@stamhoofd/migrations-manager';
import type { ImageSummary, MigrationImageOverview } from '@stamhoofd/migrations-manager';
import { BaseCommand } from '../../base-command.js';
import { formatTable } from '../../runtime/ux.js';
import { formatMigrationLabel, formatRelativeTime, formatStatus } from '../../migrations/format.js';

export default class MigrationsList extends BaseCommand {
    static summary = 'List local migration image chains';
    static flags = BaseCommand.verboseFlags;

    async run(): Promise<void> {
        await this.parse(MigrationsList);
        const chains = await listMigrationImages();
        if (chains.length === 0) {
            console.log('No migration image chains found.');
            return;
        }
        console.log(formatTable(
            ['Chain', 'Status', 'Latest', 'Images', 'Updated', 'Next step'],
            chains.map(formatChainRow),
            { title: 'Migration image chains' },
        ));
    }
}

function formatChainRow(chain: MigrationImageOverview): string[] {
    const latest = chain.failed ?? chain.latestSuccess ?? chain.base;
    return [
        chain.chainId,
        formatStatus(chain.status),
        migrationLabel(latest),
        `${chain.images.length} ${chain.images.length === 1 ? 'image' : 'images'}`,
        formatRelativeTime(latest?.labels['be.stamhoofd.migrations.finished-at'] ?? latest?.createdAt),
        nextStep(chain),
    ];
}

function migrationLabel(image: ImageSummary | undefined): string {
    if (!image) {
        return '-';
    }
    return formatMigrationLabel(image.labels['be.stamhoofd.migrations.migration'] ?? 'base');
}

function nextStep(chain: MigrationImageOverview): string {
    if (chain.status === 'failed') {
        return 'Inspect logs';
    }
    if (chain.status === 'success') {
        return 'Cleanup';
    }
    if (chain.status === 'base') {
        return 'Apply';
    }
    return 'Inspect';
}
