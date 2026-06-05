import { checkbox, confirm, input, select } from '@inquirer/prompts';
import type { ImageSummary, MigrationImageOverview } from '@stamhoofd/migrations-manager';
import { formatMigrationLabel, formatRelativeTime, formatStatus, friendlyMigrationName } from './format.js';

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

export async function selectChain(chains: MigrationImageOverview[], message: string, lastChainId?: string): Promise<string> {
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
            name: `${chain.chainId}  ${chainSummary(chain)}${chain.chainId === lastChainId ? '  selected last' : ''}`,
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
            name: `${imageReference(image)}  ${chain.chainId}  ${formatStatus(image.labels['be.stamhoofd.migrations.status'] ?? '')}`,
            value: imageReference(image),
        })),
    });
}

export async function selectImageFromChain(chains: MigrationImageOverview[], options: { message: string; lastChainId?: string }): Promise<{ chain: MigrationImageOverview; image: ImageSummary }> {
    const chainId = await selectChain(chains, options.message, options.lastChainId);
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

export async function selectDiffImagesFromChain(chains: MigrationImageOverview[], options: { lastChainId?: string }): Promise<{ chain: MigrationImageOverview; from: ImageSummary; to: ImageSummary }> {
    const chainId = await selectChain(chains, 'Which chain do you want to compare?', options.lastChainId);
    const chain = requireChain(chains, chainId);
    const from = await selectMigrationImage(chain, 'Start comparing from which image?');
    const to = await selectDiffTarget(chain, from);
    return { chain, from, to };
}

export async function selectDiffTarget(chain: MigrationImageOverview, from: ImageSummary): Promise<ImageSummary> {
    const images = chain.images;
    const fromIndex = images.findIndex(image => imageReference(image) === imageReference(from));
    const choices: Array<{ name: string; value: string; disabled?: string }> = [
        { name: `Selected: ${imageChoiceLabel(from)}`, value: '__selected__', disabled: 'Already selected as the starting image' },
    ];
    const next = fromIndex >= 0 ? images[fromIndex + 1] : undefined;
    const previous = fromIndex > 0 ? images[fromIndex - 1] : undefined;
    addChoice(choices, next, 'Next image in this chain');
    addChoice(choices, chain.latestSuccess, 'Latest successful image');
    addChoice(choices, chain.failed, 'Failed image');
    addChoice(choices, previous, 'Previous image');
    choices.push({ name: 'Browse another image in this chain', value: '__browse__' });
    const selected = await select({ message: 'Compare against which image?', choices: dedupeChoices(choices, from) });
    if (selected === '__browse__') {
        return await selectMigrationImage(chain, 'Compare against which image?', from);
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
    return `${formatStatus(chain.status)}, latest ${label.replace(/\n.*/, '')}, ${updated}`;
}

function imageKindChoices(chain: MigrationImageOverview): Array<{ name: string; value: string; disabled?: string }> {
    return [
        { name: chain.failed ? `Failed image - ${imageChoiceLabel(chain.failed)}` : 'Failed image', value: 'failed', disabled: chain.failed ? undefined : 'No failed image in this chain' },
        { name: chain.latestSuccess ? `Latest successful image - ${imageChoiceLabel(chain.latestSuccess)}` : 'Latest successful image', value: 'latest', disabled: chain.latestSuccess ? undefined : 'No successful migration image in this chain' },
        { name: chain.base ? `Base image - ${imageChoiceLabel(chain.base)}` : 'Base image', value: 'base', disabled: chain.base ? undefined : 'No base image in this chain' },
        { name: 'Browse all migration images in this chain', value: 'browse' },
    ];
}

async function selectMigrationImage(chain: MigrationImageOverview, message: string, exclude?: ImageSummary): Promise<ImageSummary> {
    const choices = chain.images.map((image) => {
        const reference = imageReference(image);
        const excluded = exclude && imageReference(exclude) === reference;
        return {
            name: imageChoiceLabel(image),
            value: reference,
            disabled: excluded ? 'Already selected as the starting image' : undefined,
        };
    });
    const selected = await select({ message, choices });
    return requireImage(chain.images, selected);
}

function imageChoiceLabel(image: ImageSummary): string {
    const index = image.labels['be.stamhoofd.migrations.migration-index'];
    const migration = image.labels['be.stamhoofd.migrations.migration'] ?? 'base';
    const prefix = index ? `#${String(Number(index) + 1).padStart(4, '0')}` : 'base';
    const status = formatStatus(image.labels['be.stamhoofd.migrations.status'] ?? '');
    const updated = formatRelativeTime(image.labels['be.stamhoofd.migrations.finished-at'] ?? image.createdAt);
    return `${prefix} ${formatMigrationLabel(migration).replace('\n', '  ')}  ${status}  ${updated}`;
}

function addChoice(choices: Array<{ name: string; value: string; disabled?: string }>, image: ImageSummary | undefined, label: string): void {
    if (!image) {
        choices.push({ name: label, value: `__missing_${choices.length}__`, disabled: 'Not available in this chain' });
        return;
    }
    choices.push({ name: `${label} - ${imageChoiceLabel(image)}`, value: imageReference(image) });
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

function imageReference(image: ImageSummary): string {
    if (image.repository && image.tag && image.repository !== '<none>' && image.tag !== '<none>') {
        return `${image.repository}:${image.tag}`;
    }
    return image.id;
}
