import { executeMigrationCleanup, listMigrationImages, planMigrationCleanup } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { formatTable } from '../../runtime/ux.js';
import { confirmAction, isInteractive, selectCleanupChains } from '../../migrations/prompts.js';

export default class MigrationsCleanup extends BaseCommand {
    static summary = 'Remove local Stamhoofd migration images safely';
    static description = 'Plans and removes only images labelled as Stamhoofd migration images. Use --dry-run to preview without deleting.';
    static examples = [
        'stam migrations cleanup',
        'stam migrations cleanup --chain <chain-id>',
        'stam migrations cleanup --tag-prefix stamhoofd-migrations/dev --dry-run',
    ];

    static flags = {
        chain: Flags.string({ description: 'Exact chain id to remove', multiple: true }),
        'tag-prefix': Flags.string({ description: 'Exact local tag prefix to remove' }),
        'dry-run': Flags.boolean({ description: 'Preview images without removing them', default: false }),
        yes: Flags.boolean({ description: 'Confirm deletion in non-interactive mode', default: false }),
    };

    async run(): Promise<void> {
        const { flags } = await this.parse(MigrationsCleanup);
        let chainIds = flags.chain;
        if ((!chainIds || chainIds.length === 0) && !flags['tag-prefix']) {
            const chains = await listMigrationImages();
            chainIds = await selectCleanupChains(chains);
        }
        if (!isInteractive() && !flags['dry-run'] && !flags.yes) {
            throw new Error('Cleanup is destructive. In non-interactive mode, pass --chain or --tag-prefix together with --yes, or use --dry-run.');
        }

        const plan = await planMigrationCleanup({ chainIds, tagPrefix: flags['tag-prefix'] });
        console.log(formatTable(['Chain', 'Images'], plan.chains.map(chain => [chain.chainId, String(chain.images.length)]), { title: 'Cleanup preview' }));
        console.log('\nWill not remove:');
        console.log('  Images without Stamhoofd migration labels');
        console.log('  Images with similar but non-matching prefixes');
        if (flags['dry-run']) {
            console.log('\nDry run only. No images removed.');
            return;
        }
        if (!flags.yes && !await confirmAction('Continue?', false)) {
            throw new Error('Cleanup cancelled.');
        }
        const result = await executeMigrationCleanup(plan);
        console.log(`Removed ${result.removed.length} migration images.`);
        console.log('\nNext step:');
        console.log('  yarn stam migrations list');
    }
}
