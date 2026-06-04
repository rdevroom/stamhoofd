import { listMigrationImages } from '@stamhoofd/migrations-manager';
import { BaseCommand } from '../../base-command.js';

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
        for (const chain of chains) {
            const latest = chain.failed ?? chain.latestSuccess ?? chain.base;
            const latestMigration = latest?.labels['be.stamhoofd.migrations.migration'] ?? 'base';
            console.log(`${chain.chainId} ${chain.status} latest=${latestMigration} images=${chain.images.length}`);
        }
    }
}
