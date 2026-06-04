import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runCommand } from './runtime.js';
import type { ChangedMigrationFile, MigrationCatalogEntry, MigrationCatalogSnapshot, MigrationPackage } from './types.js';

const migrationFolders: Array<{ package: MigrationPackage; path: string }> = [
    { package: 'models', path: 'backend/shared/models/src/migrations' },
    { package: 'email', path: 'backend/shared/email/migrations' },
    { package: 'api', path: 'backend/app/api/src/migrations' },
];

export async function createMigrationCatalog(rootDir = process.cwd()): Promise<MigrationCatalogSnapshot> {
    const entries: MigrationCatalogEntry[] = [];
    for (const folder of migrationFolders) {
        const absoluteFolder = path.join(rootDir, folder.path);
        const files = (await fs.readdir(absoluteFolder).catch(() => []))
            .filter(file => isMigrationFile(file))
            .filter(file => !file.endsWith('.down.sql') && !file.includes('.test.') && !file.endsWith('.d.ts'))
            .sort();

        for (const file of files) {
            const sourcePath = path.join(absoluteFolder, file);
            entries.push({
                index: entries.length,
                id: normalizeMigrationFile(file),
                normalizedFile: normalizeMigrationFile(file),
                sourcePath,
                package: folder.package,
                sha256: await sha256File(sourcePath),
            });
        }
    }

    const snapshot: Omit<MigrationCatalogSnapshot, 'hash'> = {
        version: 1,
        createdAt: new Date().toISOString(),
        rootDir,
        gitRevision: await getGitRevision(rootDir),
        entries,
    };
    return { ...snapshot, hash: sha256Json(snapshot) };
}

export function normalizeMigrationFile(file: string): string {
    return path.basename(file).replace(/\.ts$/, '.js');
}

export function compareCatalogs(previous: MigrationCatalogSnapshot, current: MigrationCatalogSnapshot): ChangedMigrationFile[] {
    const previousEntries = new Map(previous.entries.map(entry => [entry.normalizedFile, entry]));
    const currentEntries = new Map(current.entries.map(entry => [entry.normalizedFile, entry]));
    const changed: ChangedMigrationFile[] = [];

    for (const [normalizedFile, previousEntry] of previousEntries) {
        const currentEntry = currentEntries.get(normalizedFile);
        if (!currentEntry) {
            changed.push({ normalizedFile, previousSha256: previousEntry.sha256, status: 'removed' });
            continue;
        }
        if (currentEntry.sha256 !== previousEntry.sha256) {
            changed.push({ normalizedFile, previousSha256: previousEntry.sha256, currentSha256: currentEntry.sha256, status: 'changed' });
        }
    }

    for (const [normalizedFile, currentEntry] of currentEntries) {
        if (!previousEntries.has(normalizedFile)) {
            changed.push({ normalizedFile, currentSha256: currentEntry.sha256, status: 'added' });
        }
    }

    return changed;
}

export function selectMigrations(snapshot: MigrationCatalogSnapshot, startFrom?: string): MigrationCatalogEntry[] {
    if (!startFrom) {
        return snapshot.entries;
    }
    const normalized = normalizeMigrationFile(startFrom);
    const index = snapshot.entries.findIndex(entry => entry.normalizedFile === normalized || entry.id === normalized);
    if (index === -1) {
        throw new Error(`Migration not found in catalog: ${startFrom}`);
    }
    return snapshot.entries.slice(index);
}

export async function sha256File(file: string): Promise<string> {
    return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

export function sha256Json(value: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function isMigrationFile(file: string): boolean {
    return file.endsWith('.sql') || file.endsWith('.ts') || file.endsWith('.js');
}

async function getGitRevision(rootDir: string): Promise<string | undefined> {
    const result = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: rootDir, allowFailure: true });
    return result.status === 0 ? result.stdout.trim() : undefined;
}
