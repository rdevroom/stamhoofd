import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export type MigrationChoiceCache = {
    version: 1;
    workspaceRoot: string;
    migrations: {
        database?: string;
        tagPrefix?: string;
        build?: 'auto' | 'skip' | 'force';
        mysqlImage?: string;
        lastChainId?: string;
    };
};

export async function readMigrationChoiceCache(workspaceRoot: string): Promise<MigrationChoiceCache> {
    const file = cacheFile(workspaceRoot);
    try {
        return JSON.parse(await fs.readFile(file, 'utf-8')) as MigrationChoiceCache;
    } catch {
        return { version: 1, workspaceRoot, migrations: {} };
    }
}

export async function writeMigrationChoiceCache(workspaceRoot: string, migrations: Partial<MigrationChoiceCache['migrations']>): Promise<void> {
    const current = await readMigrationChoiceCache(workspaceRoot);
    const next: MigrationChoiceCache = {
        version: 1,
        workspaceRoot,
        migrations: { ...current.migrations, ...migrations },
    };
    const file = cacheFile(workspaceRoot);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, `${JSON.stringify(next, null, 4)}\n`);
}

function cacheFile(workspaceRoot: string): string {
    const hash = crypto.createHash('sha256').update(workspaceRoot).digest('hex').slice(0, 16);
    return path.join(cacheRoot(), `${hash}.json`);
}

function cacheRoot(): string {
    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Caches', 'be.stamhoofd.cli', 'migrations');
    }
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
        return path.join(process.env.LOCALAPPDATA, 'stamhoofd', 'cli', 'migrations');
    }
    return path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'), 'stamhoofd', 'cli', 'migrations');
}
