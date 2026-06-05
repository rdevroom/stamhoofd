import { checkbox, confirm, input, select } from '@inquirer/prompts';
import type { ImageSummary, MigrationCatalogSnapshot, MigrationImageOverview } from '@stamhoofd/migrations-manager';
import { formatMigrationLabel, formatMigrationNumber, formatMigrationProgress, formatRelativeTime, formatStatusColor, friendlyMigrationName, padColumns } from './format.js';
import { createChainProgress, imageReference } from './progress.js';

export function isInteractive(): boolean {
    return process.stdin.isTTY === true;
}

export function missingFlag(flag: string): never {
    throw new Error(`Missing required flag: --${flag}.\n\nThis command is running non-interactively, so Stamhoofd cannot ask for a value.\nPass --${flag} explicitly or run the command in an interactive terminal.`);
}

export async function resolveTextFlag(value: string | undefined, flag: string, message: string, defaultValue?: string): Promise<string> {
    if (value) {
        return value;
    }
    if (!isInteractive()) {
        missingFlag(flag);
    }
    const result = await input({ message, default: defaultValue });
    if (!result) {
        missingFlag(flag);
    }
    return result;
}

export async function resolveOptionalTextFlag(value: string | undefined, message: string, defaultValue: string): Promise<string> {
    if (value) {
        return value;
    }
    if (!isInteractive()) {
        return defaultValue;
    }
    return await input({ message, default: defaultValue });
}

export async function resolveBuildFlag(value: string | undefined, defaultValue?: 'auto' | 'skip' | 'force'): Promise<'auto' | 'skip' | 'force'> {
    if (value === 'auto' || value === 'skip' || value === 'force') {
        return value;
    }
    if (!isInteractive()) {
        return defaultValue ?? 'auto';
    }
    return await select({
        message: 'How should builds be handled?',
        default: defaultValue ?? 'auto',
        choices: [
            { name: 'Auto - build only when required outputs are missing', value: 'auto' as const },
            { name: 'Skip - fastest, assumes you already built everything', value: 'skip' as const },
            { name: 'Force - safest, rebuild before running migrations', value: 'force' as const },
        ],
    });
}

export async function selectChain(chains: MigrationImageOverview[], message: string, lastChainId?: string, catalog?: MigrationCatalogSnapshot): Promise<string> {
    if (!isInteractive()) {
        missingFlag('chain');
    }
    const sorted = [...chains].sort((a, b) => {
        if (a.chainId === lastChainId) return -1;
        if (b.chainId === lastChainId) return 1;
        if (a.status === 'failed' && b.status !== 'failed') return -1;
        if (b.status === 'failed' && a.status !== 'failed') return 1;
        return latestDate(b).localeCompare(latestDate(a));
    });
    return await select({
        message,
        choices: sorted.map(chain => ({
            name: catalog ? chainChoiceLabel(chain, catalog, chain.chainId === lastChainId) : `${chain.chainId}  ${chainSummary(chain)}${chain.chainId === lastChainId ? '  selected last' : ''}`,
            value: chain.chainId,
        })),
    });
}

export async function selectImage(chains: MigrationImageOverview[], message: string): Promise<string> {
    if (!isInteractive()) {
        missingFlag('image');
    }
    const images = chains.flatMap(chain => chain.images.map(image => ({ chain, image })));
    return await select({
        message,
        choices: images.map(({ chain, image }) => ({
            name: padColumns([imageReference(image), chain.chainId, formatStatusColor(image.labels['be.stamhoofd.migrations.status'] ?? '')], [60, 18, 12]),
            value: imageReference(image),
        })),
    });
}

export async function selectImageFromChain(chains: MigrationImageOverview[], options: { message: string; lastChainId?: string; catalog?: MigrationCatalogSnapshot }): Promise<{ chain: MigrationImageOverview; image: ImageSummary }> {
    const chainId = await selectChain(chains, options.message, options.lastChainId, options.catalog);
    const chain = requireChain(chains, chainId);
    const kind = await select({
        message: 'Which image do you want?',
        choices: imageKindChoices(chain),
    });
    if (kind === 'failed' && chain.failed) {
        return { chain, image: chain.failed };
    }
    if (kind === 'latest' && chain.latestSuccess) {
        return { chain, image: chain.latestSuccess };
    }
    if (kind === 'base' && chain.base) {
        return { chain, image: chain.base };
    }
    return { chain, image: await selectMigrationImage(chain, 'Which migration image do you want?') };
}

export async function selectDiffImagesFromChain(chains: MigrationImageOverview[], options: { lastChainId?: string; catalog?: MigrationCatalogSnapshot }): Promise<{ chain: MigrationImageOverview; from: ImageSummary; to: ImageSummary }> {
    const chainId = await selectChain(chains, 'Which chain do you want to compare?', options.lastChainId, options.catalog);
    const chain = requireChain(chains, chainId);
    const from = await selectMigrationImage(chain, 'Start comparing from which image?', undefined, options.catalog);
    const to = await selectDiffTarget(chain, from, options.catalog);
    return { chain, from, to };
}

export async function selectDiffTarget(chain: MigrationImageOverview, from: ImageSummary, catalog?: MigrationCatalogSnapshot): Promise<ImageSummary> {
    const images = chain.images;
    const fromIndex = images.findIndex(image => imageReference(image) === imageReference(from));
    const choices: Array<{ name: string; value: string; disabled?: string }> = [
        { name: `Selected: ${imageChoiceLabel(from, catalog)}`, value: '__selected__', disabled: 'Already selected as the starting image' },
    ];
    const next = fromIndex >= 0 ? images[fromIndex + 1] : undefined;
    const previous = fromIndex > 0 ? images[fromIndex - 1] : undefined;
    addChoice(choices, next, 'Next image in this chain', catalog);
    addChoice(choices, chain.latestSuccess, 'Latest successful image', catalog);
    addChoice(choices, chain.failed, 'Failed image', catalog);
    addChoice(choices, previous, 'Previous image', catalog);
    choices.push({ name: 'Browse another image in this chain', value: '__browse__' });
    const selected = await select({ message: 'Compare against which image?', choices: dedupeChoices(choices, from) });
    if (selected === '__browse__') {
        return await selectMigrationImage(chain, 'Compare against which image?', from, catalog);
    }
    return requireImage(chain.images, selected);
}

export async function selectDiffMode(): Promise<'schema' | 'data' | 'both'> {
    if (!isInteractive()) {
        return 'schema';
    }
    return await select({
        message: 'What do you want to compare?',
        default: 'schema',
        choices: [
            { name: 'Schema changes - table and column definitions', value: 'schema' as const },
            { name: 'Data changes - row-count summary per table', value: 'data' as const },
            { name: 'Both schema and data summaries', value: 'both' as const },
        ],
    });
}

export async function selectMigrationFile(files: string[], defaultFile?: string): Promise<string> {
    if (!isInteractive()) {
        missingFlag('from');
    }
    return await select({
        message: 'Which migration should be rerun?',
        default: defaultFile,
        choices: files.map(file => ({ name: `${friendlyMigrationName(file)}  ${file}`, value: file })),
    });
}

export async function selectCleanupChains(chains: MigrationImageOverview[]): Promise<string[]> {
    if (!isInteractive()) {
        missingFlag('chain');
    }
    return await checkbox({
        message: 'Which chains do you want to remove?',
        choices: chains.map(chain => ({ name: `${chain.chainId}  ${chainSummary(chain)}`, value: chain.chainId })),
        required: true,
    });
}

export async function selectBaseImage(chains: MigrationImageOverview[], catalog: MigrationCatalogSnapshot): Promise<ImageSummary | 'create'> {
    if (!isInteractive()) {
        missingFlag('base');
    }
    const baseChains = chains.filter(chain => chain.base);
    const choices = baseChains.map((chain) => {
        const progress = createChainProgress(chain, catalog);
        return {
            name: padColumns([
                chain.chainId,
                formatStatusColor(chain.status),
                `${formatMigrationProgress(progress.completed, progress.total)} migrations`,
                imageChoiceLabel(chain.base!, catalog),
            ], [18, 12, 16, 60]),
            value: imageReference(chain.base!),
        };
    });
    choices.push({ name: 'Create a new empty base image', value: '__create__' });
    const selected = await select({ message: 'Which base image should migrations start from?', choices });
    if (selected === '__create__') {
        return 'create';
    }
    const image = baseChains.flatMap(chain => chain.base ? [chain.base] : []).find(base => imageReference(base) === selected);
    if (!image) {
        throw new Error(`Base image not found: ${selected}`);
    }
    return image;
}

export async function confirmAction(message: string, defaultValue = false): Promise<boolean> {
    if (!isInteractive()) {
        return false;
    }
    return await confirm({ message, default: defaultValue });
}

function chainSummary(chain: MigrationImageOverview): string {
    const latest = chain.failed ?? chain.latestSuccess ?? chain.base;
    const migration = latest?.labels['be.stamhoofd.migrations.migration'];
    const label = migration ? friendlyMigrationName(migration) : formatMigrationLabel('base');
    const updated = formatRelativeTime(latest?.labels['be.stamhoofd.migrations.finished-at'] ?? latest?.createdAt);
    return `${formatStatusColor(chain.status)}, latest ${label.replace(/\n.*/, '')}, ${updated}`;
}

function imageKindChoices(chain: MigrationImageOverview): Array<{ name: string; value: string; disabled?: string }> {
    return [
        { name: chain.failed ? `Failed image - ${imageChoiceLabel(chain.failed)}` : 'Failed image', value: 'failed', disabled: chain.failed ? undefined : 'No failed image in this chain' },
        { name: chain.latestSuccess ? `Last successful migration - ${imageChoiceLabel(chain.latestSuccess)}` : 'Last successful migration', value: 'latest', disabled: chain.latestSuccess ? undefined : 'No successful migration image in this chain' },
        { name: chain.base ? `Base image - ${imageChoiceLabel(chain.base)}` : 'Base image', value: 'base', disabled: chain.base ? undefined : 'No base image in this chain' },
        { name: 'Browse all migration images in this chain', value: 'browse' },
    ];
}

async function selectMigrationImage(chain: MigrationImageOverview, message: string, exclude?: ImageSummary, catalog?: MigrationCatalogSnapshot): Promise<ImageSummary> {
    const choices = chain.images.map((image) => {
        const reference = imageReference(image);
        const excluded = exclude && imageReference(exclude) === reference;
        return {
            name: imageChoiceLabel(image, catalog),
            value: reference,
            disabled: excluded ? 'Already selected as the starting image' : undefined,
        };
    });
    const selected = await select({ message, choices });
    return requireImage(chain.images, selected);
}

function imageChoiceLabel(image: ImageSummary, catalog?: MigrationCatalogSnapshot): string {
    const index = image.labels['be.stamhoofd.migrations.migration-index'];
    const migration = image.labels['be.stamhoofd.migrations.migration'] ?? 'base';
    const prefix = index !== undefined ? catalog ? formatMigrationProgress(Number(index) + 1, catalog.entries.length) : formatMigrationNumber(Number(index)) : 'base';
    const status = formatStatusColor(image.labels['be.stamhoofd.migrations.status'] ?? '');
    const updated = formatRelativeTime(image.labels['be.stamhoofd.migrations.finished-at'] ?? image.createdAt);
    return padColumns([prefix, formatMigrationLabel(migration).replace('\n', '  '), status, updated], [8, 70, 12, 12]);
}

function addChoice(choices: Array<{ name: string; value: string; disabled?: string }>, image: ImageSummary | undefined, label: string, catalog?: MigrationCatalogSnapshot): void {
    if (!image) {
        choices.push({ name: label, value: `__missing_${choices.length}__`, disabled: 'Not available in this chain' });
        return;
    }
    choices.push({ name: `${label} - ${imageChoiceLabel(image, catalog)}`, value: imageReference(image) });
}

function dedupeChoices(choices: Array<{ name: string; value: string; disabled?: string }>, from: ImageSummary): Array<{ name: string; value: string; disabled?: string }> {
    const seen = new Set<string>();
    return choices.filter((choice) => {
        if (choice.disabled) {
            return true;
        }
        if (choice.value === imageReference(from)) {
            choice.disabled = 'Already selected as the starting image';
            return true;
        }
        if (seen.has(choice.value)) {
            return false;
        }
        seen.add(choice.value);
        return true;
    });
}

function requireChain(chains: MigrationImageOverview[], chainId: string): MigrationImageOverview {
    const chain = chains.find(c => c.chainId === chainId);
    if (!chain) {
        throw new Error(`Migration chain not found: ${chainId}`);
    }
    return chain;
}

function requireImage(images: ImageSummary[], reference: string): ImageSummary {
    const image = images.find(item => imageReference(item) === reference);
    if (!image) {
        throw new Error(`Migration image not found: ${reference}`);
    }
    return image;
}

function latestDate(chain: MigrationImageOverview): string {
    const latest = chain.failed ?? chain.latestSuccess ?? chain.base;
    return latest?.labels['be.stamhoofd.migrations.finished-at'] ?? latest?.createdAt ?? '';
}

function chainChoiceLabel(chain: MigrationImageOverview, catalog: MigrationCatalogSnapshot, selectedLast: boolean): string {
    const progress = createChainProgress(chain, catalog);
    const next = progress.next ? `${formatMigrationProgress(progress.next.index + 1, progress.total)} ${friendlyMigrationName(progress.next.normalizedFile)}` : '-';
    const last = progress.lastSuccess ? imageChoiceLabel(progress.lastSuccess, catalog) : '-';
    return padColumns([
        chain.chainId,
        formatStatusColor(chain.status),
        `${formatMigrationProgress(progress.completed, progress.total)} migrations`,
        `Last ${last}`,
        `Next ${next}`,
        selectedLast ? 'selected last' : '',
    ], [18, 12, 16, 96, 40, 14]);
}
