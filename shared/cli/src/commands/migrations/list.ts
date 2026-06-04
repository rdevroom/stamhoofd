import { listMigrationImages } from '@stamhoofd/migrations-manager';
import type { ImageSummary, MigrationImageOverview } from '@stamhoofd/migrations-manager';
import { BaseCommand } from '../../base-command.js';
import { formatTable } from '../../runtime/ux.js';

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
            ['Chain', 'Database', 'Status', 'Base', 'Latest success', 'Failed', 'Images', 'Timestamp', 'Parent chain'],
            chains.map(formatChainRow),
            { title: 'Migration image chains' },
        ));
    }
}

function formatChainRow(chain: MigrationImageOverview): string[] {
    const latest = chain.failed ?? chain.latestSuccess ?? chain.base;
    return [
        chain.chainId,
        latest?.labels['be.stamhoofd.migrations.database'] ?? chain.base?.labels['be.stamhoofd.migrations.database'] ?? '-',
        chain.status,
        imageReference(chain.base),
        migrationLabel(chain.latestSuccess),
        migrationLabel(chain.failed),
        String(chain.images.length),
        latest?.labels['be.stamhoofd.migrations.finished-at'] ?? latest?.createdAt ?? '-',
        latest?.labels['be.stamhoofd.migrations.parent-chain'] ?? latest?.labels['be.stamhoofd.migrations.forked-from-chain'] ?? '-',
    ];
}

function migrationLabel(image: ImageSummary | undefined): string {
    if (!image) {
        return '-';
    }
    return image.labels['be.stamhoofd.migrations.migration'] ?? 'base';
}

function imageReference(image: ImageSummary | undefined): string {
    if (!image) {
        return '-';
    }
    if (image.repository && image.tag && image.repository !== '<none>' && image.tag !== '<none>') {
        return `${image.repository}:${image.tag}`;
    }
    return image.id;
}
