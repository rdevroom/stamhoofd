import type { MigrationImageManifest } from './types.js';

export const migrationLabel = 'be.stamhoofd.migrations';

export function labelsForManifest(manifest: MigrationImageManifest): Record<string, string> {
    return compactLabels({
        [migrationLabel]: 'true',
        'be.stamhoofd.migrations.chain': manifest.chainId,
        'be.stamhoofd.migrations.role': manifest.role,
        'be.stamhoofd.migrations.status': manifest.status,
        'be.stamhoofd.migrations.database': manifest.database,
        'be.stamhoofd.migrations.display-name': manifest.displayName,
        'be.stamhoofd.migrations.parent-image': manifest.parentImage,
        'be.stamhoofd.migrations.parent-chain': manifest.previousChainId,
        'be.stamhoofd.migrations.forked-from-chain': manifest.previousChainId,
        'be.stamhoofd.migrations.migration': manifest.migration?.normalizedFile,
        'be.stamhoofd.migrations.migration-index': manifest.migration ? String(manifest.migration.index) : undefined,
        'be.stamhoofd.migrations.migration-sha256': manifest.migration?.sha256,
        'be.stamhoofd.migrations.catalog-sha256': manifest.catalog?.hash,
        'be.stamhoofd.migrations.base-migration-count': manifest.baseMigrationCount === undefined ? undefined : String(manifest.baseMigrationCount),
        'be.stamhoofd.migrations.base-migration-total': manifest.baseMigrationTotal === undefined ? undefined : String(manifest.baseMigrationTotal),
        'be.stamhoofd.migrations.base-last-migration': manifest.baseLastMigration,
        'be.stamhoofd.migrations.base-last-migration-index': manifest.baseLastMigrationIndex === undefined ? undefined : String(manifest.baseLastMigrationIndex),
        'be.stamhoofd.migrations.dump-sha256': manifest.dumpSha256,
        'be.stamhoofd.migrations.git-revision': manifest.catalog?.gitRevision,
        'be.stamhoofd.migrations.started-at': manifest.startedAt,
        'be.stamhoofd.migrations.finished-at': manifest.finishedAt,
    });
}

function compactLabels(labels: Record<string, string | undefined>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(labels)) {
        if (value !== undefined && value !== '') {
            result[key] = value;
        }
    }
    return result;
}
