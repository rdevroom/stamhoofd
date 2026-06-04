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
