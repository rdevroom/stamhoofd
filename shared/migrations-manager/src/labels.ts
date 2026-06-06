import type { MigrationImageManifest, MigrationTimingPhase, MigrationTimings } from './types.js';

export const migrationLabel = 'be.stamhoofd.migrations';

export function labelsForManifest(manifest: MigrationImageManifest, timings: MigrationTimings | undefined = manifest.timings): Record<string, string> {
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
        ...labelsForTimings(timings),
    });
}

export function timingsFromLabels(labels: Record<string, string>): MigrationTimings | undefined {
    const totalMs = numberLabel(labels['be.stamhoofd.migrations.duration-ms']);
    if (totalMs === undefined) {
        return undefined;
    }
    const phases: MigrationTimingPhase[] = Object.entries(labels)
        .flatMap(([key, value]) => {
            const match = key.match(/^be\.stamhoofd\.migrations\.phase\.(.+)-ms$/);
            const durationMs = numberLabel(value);
            return match && durationMs !== undefined
                ? [{ name: match[1], startedAt: '', finishedAt: '', durationMs, status: 'success' as const }]
                : [];
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    return { totalMs, phases };
}

function labelsForTimings(timings: MigrationTimings | undefined): Record<string, string | undefined> {
    if (!timings) {
        return {};
    }
    const labels: Record<string, string> = {
        'be.stamhoofd.migrations.duration-ms': String(Math.round(timings.totalMs)),
    };
    for (const phase of timings.phases) {
        labels[`be.stamhoofd.migrations.phase.${phase.name}-ms`] = String(Math.round(phase.durationMs));
    }
    return labels;
}

function numberLabel(value: string | undefined): number | undefined {
    if (value === undefined) {
        return undefined;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
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
