import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CleanupOptions, CleanupPlan, CleanupResult, ContainerRuntime, ImageSummary, MigrationDiffOptions, MigrationDiffResult, MigrationImageDetails, MigrationImageManifest, MigrationImageOverview, MigrationSqlExportOptions, MigrationSqlExportResult, RerunStart, ResolveRerunStartOptions } from './types.js';
import { createCliContainerRuntime } from './runtime.js';
import { migrationLabel } from './labels.js';

export async function listMigrationImages(options: { runtime?: ContainerRuntime } = {}): Promise<MigrationImageOverview[]> {
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const images = await runtime.listImagesByLabel(`${migrationLabel}=true`);
    const byChain = new Map<string, ImageSummary[]>();
    for (const image of images) {
        const chain = image.labels['be.stamhoofd.migrations.chain'];
        if (!chain) {
            continue;
        }
        byChain.set(chain, [...(byChain.get(chain) ?? []), image]);
    }
    return [...byChain.entries()].map(([chainId, chainImages]) => {
        const sorted = chainImages.sort(compareImageLayer);
        const failed = sorted.find(image => image.labels['be.stamhoofd.migrations.status'] === 'failed');
        const successes = sorted.filter(image => image.labels['be.stamhoofd.migrations.status'] === 'success');
        const base = sorted.find(image => image.labels['be.stamhoofd.migrations.role'] === 'base');
        const status: MigrationImageOverview['status'] = failed ? 'failed' : successes.length > 0 ? 'success' : base ? 'base' : 'unknown';
        return {
            chainId,
            images: sorted,
            base,
            latestSuccess: successes.at(-1),
            failed,
            status,
        };
    }).sort((a, b) => latestImageDate(b).localeCompare(latestImageDate(a)));
}

export async function inspectMigrationImage(options: { image: string; runtime?: ContainerRuntime }): Promise<MigrationImageDetails> {
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const metadata = await runtime.inspectImage(options.image);
    const container = `stamhoofd-migrations-inspect-${Date.now()}`;
    let manifest: MigrationImageManifest | undefined;
    let logs: string | undefined;
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'stamhoofd-migrations-inspect-'));
    try {
        await runtime.run(['create', '--name', container, options.image]);
        const manifestPath = path.join(tmp, 'manifest.json');
        const result = await runtime.run(['cp', `${container}:/stamhoofd-migrations/manifest.json`, manifestPath], { allowFailure: true });
        if (result.status === 0) {
            manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as MigrationImageManifest;
        }
        const logPath = manifest?.logPath;
        if (logPath) {
            const logsPath = path.join(tmp, 'migration.log');
            const logsResult = await runtime.run(['cp', `${container}:${logPath}`, logsPath], { allowFailure: true });
            if (logsResult.status === 0) {
                logs = await fs.readFile(logsPath, 'utf-8');
            }
        }
    } finally {
        await runtime.remove(container);
        await fs.rm(tmp, { recursive: true, force: true });
    }
    return { image: options.image, metadata, manifest, logs };
}

export async function resolveRerunStart(options: ResolveRerunStartOptions): Promise<RerunStart> {
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const chains = await listMigrationImages({ runtime });
    const chain = chains.find(c => c.chainId === options.chainId);
    if (!chain) {
        throw new Error(`Migration chain not found: ${options.chainId}`);
    }
    const failedFrom = chain.failed?.labels['be.stamhoofd.migrations.migration'];
    const latest = chain.failed ?? chain.latestSuccess ?? chain.base;
    if (!latest) {
        throw new Error(`Migration chain has no usable images: ${options.chainId}`);
    }
    const latestDetails = await inspectMigrationImage({ image: imageReference(latest), runtime });
    const normalizedFrom = (options.from ?? failedFrom ?? firstMissingMigration(latestDetails.manifest) ?? '').replace(/\.ts$/, '.js');
    if (!normalizedFrom) {
        throw new Error(`Could not infer migration to rerun for chain ${options.chainId}. Pass --from explicitly.`);
    }
    const migrationImages = chain.images.filter(image => image.labels['be.stamhoofd.migrations.role'] === 'migration');
    const targetIndex = latestDetails.manifest?.catalog?.entries.find(entry => entry.normalizedFile === normalizedFrom)?.index
        ?? Number(migrationImages.find(image => image.labels['be.stamhoofd.migrations.migration'] === normalizedFrom)?.labels['be.stamhoofd.migrations.migration-index']);
    if (!Number.isFinite(targetIndex)) {
        throw new Error(`Migration not found in chain ${options.chainId}: ${options.from}`);
    }
    const predecessor = targetIndex === 0
        ? chain.base
        : migrationImages.find(image => Number(image.labels['be.stamhoofd.migrations.migration-index']) === targetIndex - 1 && image.labels['be.stamhoofd.migrations.status'] === 'success');
    if (!predecessor) {
        throw new Error(`Could not resolve predecessor image before ${options.from}`);
    }

    const imageRef = imageReference(predecessor);
    const details = await inspectMigrationImage({ image: imageRef, runtime });
    return {
        baseImage: imageRef,
        startFrom: normalizedFrom,
        previousChainId: options.chainId,
        previousCatalog: details.manifest?.catalog ?? latestDetails.manifest?.catalog,
    };
}

export async function planMigrationCleanup(options: CleanupOptions = {}): Promise<CleanupPlan> {
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const chains = await listMigrationImages({ runtime });
    const selected = chains.filter((chain) => {
        if (options.chainIds && options.chainIds.length > 0) {
            return options.chainIds.includes(chain.chainId);
        }
        if (options.tagPrefix) {
            return chain.images.some(image => image.repository === options.tagPrefix || `${image.repository}:${image.tag}`.startsWith(`${options.tagPrefix}:`));
        }
        return false;
    });
    const images = selected.flatMap(chain => chain.images).filter(image => image.labels[migrationLabel] === 'true');
    return { chains: selected.map(chain => ({ chainId: chain.chainId, images: chain.images })), images };
}

export async function executeMigrationCleanup(plan: CleanupPlan, options: { runtime?: ContainerRuntime } = {}): Promise<CleanupResult> {
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const removed: string[] = [];
    for (const image of plan.images) {
        const reference = imageReference(image);
        await runtime.run(['rmi', reference], { allowFailure: true });
        removed.push(reference);
    }
    return { removed };
}

export async function diffMigrationSchema(options: MigrationDiffOptions): Promise<MigrationDiffResult> {
    return await diffMigrationImages(options, '--no-data', 'schema');
}

export async function diffMigrationData(options: MigrationDiffOptions): Promise<MigrationDiffResult> {
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const fromContainer = `stamhoofd-migrations-diff-from-${Date.now()}`;
    const toContainer = `stamhoofd-migrations-diff-to-${Date.now()}`;
    try {
        await runtime.run(['run', '-d', '--name', fromContainer, '-e', 'MYSQL_ROOT_PASSWORD=root', options.from, '--datadir=/stamhoofd-mysql-data', '--mysql-native-password=ON']);
        await runtime.run(['run', '-d', '--name', toContainer, '-e', 'MYSQL_ROOT_PASSWORD=root', options.to, '--datadir=/stamhoofd-mysql-data', '--mysql-native-password=ON']);
        await waitForMysql(runtime, fromContainer);
        await waitForMysql(runtime, toContainer);
        const tables = (await runtime.exec(toContainer, ['mysql', '-h127.0.0.1', '-uroot', '-proot', '-N', '-e', `SHOW TABLES FROM \`${options.database}\`;`])).stdout.split('\n').filter(Boolean);
        const beforeLines = ['Table\tRows'];
        const afterLines = ['Table\tRows'];
        const lines = ['Table\tBefore rows\tAfter rows\tStatus'];
        for (const table of tables) {
            const before = await rowCount(runtime, fromContainer, options.database, table);
            const after = await rowCount(runtime, toContainer, options.database, table);
            beforeLines.push(`${table}\t${before}`);
            afterLines.push(`${table}\t${after}`);
            lines.push(`${table}\t${before}\t${after}\t${before === after ? 'Unchanged' : 'Changed'}`);
        }
        const diff = `${lines.join('\n')}\n`;
        const beforePath = options.outputPath ? options.outputPath.replace(/\.data\.diff$/, '.before.data.tsv') : undefined;
        const afterPath = options.outputPath ? options.outputPath.replace(/\.data\.diff$/, '.after.data.tsv') : undefined;
        if (options.outputPath) {
            await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
            await fs.writeFile(options.outputPath, diff);
            if (beforePath && afterPath) {
                await fs.writeFile(beforePath, `${beforeLines.join('\n')}\n`);
                await fs.writeFile(afterPath, `${afterLines.join('\n')}\n`);
            }
        }
        return { from: options.from, to: options.to, outputPath: options.outputPath, beforePath, afterPath, preview: diff.split('\n').slice(0, 20).join('\n') };
    } finally {
        await runtime.remove(fromContainer);
        await runtime.remove(toContainer);
    }
}

export async function resolveMigrationImageDatabase(options: { image: string; runtime?: ContainerRuntime }): Promise<string | undefined> {
    const details = await inspectMigrationImage(options);
    return details.manifest?.database ?? details.metadata.labels['be.stamhoofd.migrations.database'];
}

export async function listMigrationImageTables(options: { image: string; database?: string; runtime?: ContainerRuntime }): Promise<string[]> {
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const database = options.database ?? await resolveMigrationImageDatabase({ image: options.image, runtime }) ?? 'stamhoofd-migrations';
    const container = `stamhoofd-migrations-export-list-${Date.now()}`;
    try {
        await runtime.run(['run', '-d', '--name', container, '-e', 'MYSQL_ROOT_PASSWORD=root', options.image, '--datadir=/stamhoofd-mysql-data', '--mysql-native-password=ON']);
        await waitForMysql(runtime, container);
        const result = await runtime.exec(container, ['mysql', '-h127.0.0.1', '-uroot', '-proot', '-N', '-e', `SHOW TABLES FROM \`${database}\`;`]);
        return result.stdout.split('\n').filter(Boolean);
    } finally {
        await runtime.remove(container);
    }
}

export async function exportMigrationImageSql(options: MigrationSqlExportOptions): Promise<MigrationSqlExportResult> {
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const database = options.database ?? await resolveMigrationImageDatabase({ image: options.image, runtime }) ?? 'stamhoofd-migrations';
    const tables = options.tables && options.tables.length > 0 ? options.tables : await listMigrationImageTables({ image: options.image, database, runtime });
    const container = `stamhoofd-migrations-export-${Date.now()}`;
    try {
        await runtime.run(['run', '-d', '--name', container, '-e', 'MYSQL_ROOT_PASSWORD=root', options.image, '--datadir=/stamhoofd-mysql-data', '--mysql-native-password=ON']);
        await waitForMysql(runtime, container);
        const dump = await runtime.exec(container, ['mysqldump', '-h127.0.0.1', '-uroot', '-proot', '--skip-comments', database, ...tables]);
        await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
        await fs.writeFile(options.outputPath, dump.stdout);
        return { image: options.image, database, tables, outputPath: options.outputPath };
    } finally {
        await runtime.remove(container);
    }
}

async function diffMigrationImages(options: MigrationDiffOptions, dumpMode: '--no-data', suffix: string): Promise<MigrationDiffResult> {
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'stamhoofd-migrations-diff-'));
    const fromContainer = `stamhoofd-migrations-diff-from-${Date.now()}`;
    const toContainer = `stamhoofd-migrations-diff-to-${Date.now()}`;
    try {
        await runtime.run(['run', '-d', '--name', fromContainer, '-e', 'MYSQL_ROOT_PASSWORD=root', options.from, '--datadir=/stamhoofd-mysql-data', '--mysql-native-password=ON']);
        await runtime.run(['run', '-d', '--name', toContainer, '-e', 'MYSQL_ROOT_PASSWORD=root', options.to, '--datadir=/stamhoofd-mysql-data', '--mysql-native-password=ON']);
        await waitForMysql(runtime, fromContainer);
        await waitForMysql(runtime, toContainer);
        const before = normalizeDump((await runtime.exec(fromContainer, ['mysqldump', '-h127.0.0.1', '-uroot', '-proot', dumpMode, '--skip-comments', options.database])).stdout);
        const after = normalizeDump((await runtime.exec(toContainer, ['mysqldump', '-h127.0.0.1', '-uroot', '-proot', dumpMode, '--skip-comments', options.database])).stdout);
        const beforeFile = path.join(tmp, `before.${suffix}.sql`);
        const afterFile = path.join(tmp, `after.${suffix}.sql`);
        await fs.writeFile(beforeFile, before);
        await fs.writeFile(afterFile, after);
        const diff = await import('./runtime.js').then(({ runCommand }) => runCommand('diff', ['-u', beforeFile, afterFile], { allowFailure: true }));
        const output = diff.stdout || 'No differences found.\n';
        const beforePath = options.outputPath ? options.outputPath.replace(/\.schema\.diff$/, '.before.schema.sql') : undefined;
        const afterPath = options.outputPath ? options.outputPath.replace(/\.schema\.diff$/, '.after.schema.sql') : undefined;
        if (options.outputPath) {
            await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
            await fs.writeFile(options.outputPath, output);
            if (beforePath && afterPath) {
                await fs.writeFile(beforePath, before);
                await fs.writeFile(afterPath, after);
            }
        }
        return { from: options.from, to: options.to, outputPath: options.outputPath, beforePath, afterPath, preview: output.split('\n').slice(0, 80).join('\n') };
    } finally {
        await runtime.remove(fromContainer);
        await runtime.remove(toContainer);
        await fs.rm(tmp, { recursive: true, force: true });
    }
}

function compareImageLayer(a: ImageSummary, b: ImageSummary): number {
    const ai = Number(a.labels['be.stamhoofd.migrations.migration-index'] ?? -1);
    const bi = Number(b.labels['be.stamhoofd.migrations.migration-index'] ?? -1);
    return ai - bi;
}

function imageReference(image: ImageSummary): string {
    if (image.repository && image.tag && image.repository !== '<none>' && image.tag !== '<none>') {
        return `${image.repository}:${image.tag}`;
    }
    return image.id;
}

function latestImageDate(chain: MigrationImageOverview): string {
    const latest = chain.failed ?? chain.latestSuccess ?? chain.base;
    return latest?.labels['be.stamhoofd.migrations.finished-at'] ?? latest?.createdAt ?? '';
}

function firstMissingMigration(manifest: MigrationImageManifest | undefined): string | undefined {
    if (!manifest?.catalog?.entries) {
        return undefined;
    }
    const currentIndex = manifest.migration?.index ?? -1;
    return manifest.catalog.entries.find(entry => entry.index > currentIndex)?.normalizedFile;
}

async function waitForMysql(runtime: ContainerRuntime, container: string): Promise<void> {
    for (let i = 0; i < 90; i++) {
        const result = await runtime.exec(container, ['mysql', '-h127.0.0.1', '-uroot', '-proot', '-e', 'SELECT 1'], { allowFailure: true });
        if (result.status === 0) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error(`MySQL did not become ready in ${container}.`);
}

async function rowCount(runtime: ContainerRuntime, container: string, database: string, table: string): Promise<string> {
    const result = await runtime.exec(container, ['mysql', '-h127.0.0.1', '-uroot', '-proot', '-N', '-e', `SELECT COUNT(*) FROM \`${database}\`.\`${table}\`;`], { allowFailure: true });
    return result.status === 0 ? result.stdout.trim() : '-';
}

function normalizeDump(dump: string): string {
    return dump.split('\n').filter(line => !line.startsWith('--') && !line.includes('Dump completed')).join('\n');
}
