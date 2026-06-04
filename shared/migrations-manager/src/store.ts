import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ContainerRuntime, ImageSummary, MigrationImageDetails, MigrationImageManifest, MigrationImageOverview, RerunStart, ResolveRerunStartOptions } from './types.js';
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
        return {
            chainId,
            images: sorted,
            base,
            latestSuccess: successes.at(-1),
            failed,
            status: failed ? 'failed' : successes.length > 0 ? 'success' : base ? 'base' : 'unknown',
        };
    });
}

export async function inspectMigrationImage(options: { image: string; runtime?: ContainerRuntime }): Promise<MigrationImageDetails> {
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const metadata = await runtime.inspectImage(options.image);
    const container = `stamhoofd-migrations-inspect-${Date.now()}`;
    let manifest: MigrationImageManifest | undefined;
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'stamhoofd-migrations-inspect-'));
    try {
        await runtime.run(['create', '--name', container, options.image]);
        const manifestPath = path.join(tmp, 'manifest.json');
        const result = await runtime.run(['cp', `${container}:/stamhoofd-migrations/manifest.json`, manifestPath], { allowFailure: true });
        if (result.status === 0) {
            manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as MigrationImageManifest;
        }
    } finally {
        await runtime.remove(container);
        await fs.rm(tmp, { recursive: true, force: true });
    }
    return { image: options.image, metadata, manifest };
}

export async function resolveRerunStart(options: ResolveRerunStartOptions): Promise<RerunStart> {
    const runtime = options.runtime ?? await createCliContainerRuntime();
    const chains = await listMigrationImages({ runtime });
    const chain = chains.find(c => c.chainId === options.chainId);
    if (!chain) {
        throw new Error(`Migration chain not found: ${options.chainId}`);
    }
    const normalizedFrom = options.from.replace(/\.ts$/, '.js');
    const migrationImages = chain.images.filter(image => image.labels['be.stamhoofd.migrations.role'] === 'migration');
    const latest = chain.failed ?? chain.latestSuccess ?? chain.base;
    if (!latest) {
        throw new Error(`Migration chain has no usable images: ${options.chainId}`);
    }
    const latestDetails = await inspectMigrationImage({ image: imageReference(latest), runtime });
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
