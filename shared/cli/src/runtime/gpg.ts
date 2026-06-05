import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { select } from '@inquirer/prompts';
import type { CliContext } from '../context/create-context.js';
import { run } from './command-runner.js';

type GpgChoice = {
    name: string;
    value: string;
    source: 'gpg' | '1password';
};

type OnePasswordItem = {
    id: string;
    title?: string;
    category?: string;
    vault?: { name?: string };
};

export async function resolveGpgRecipient(options: { flag?: string; context: CliContext }): Promise<string> {
    if (options.flag) {
        return options.flag;
    }
    if (process.env.STAMHOOFD_DB_EXPORT_GPG_RECIPIENT) {
        return process.env.STAMHOOFD_DB_EXPORT_GPG_RECIPIENT;
    }

    const choices = [
        ...(await listLocalGpgRecipients(options.context.verbose)),
        ...(await listOnePasswordGpgChoices(options.context.verbose)),
    ];

    if (choices.length === 0) {
        throw new Error('No GPG recipients found. Pass --recipient, set STAMHOOFD_DB_EXPORT_GPG_RECIPIENT, or run stam setup gpg.');
    }

    const selected = await select({
        message: 'Select the GPG recipient for encryption',
        choices: choices.map(choice => ({ name: choice.name, value: choice.value })),
    });

    const choice = choices.find(candidate => candidate.value === selected);
    if (choice?.source === '1password') {
        return await importOnePasswordPublicKey(selected, options.context);
    }

    return selected;
}

export async function setupGpg(context: CliContext): Promise<void> {
    if (context.verbose) {
        console.log('Checking local GPG installation...');
    }
    await run('gpg', ['--version'], { quiet: true });
    const localRecipients = await listLocalGpgRecipients(context.verbose);
    if (context.verbose) {
        console.log(`Local GPG recipients found: ${localRecipients.length}`);
        console.log('Checking 1Password for GPG/PGP-looking items...');
    }
    const choices = await listOnePasswordGpgChoices(context.verbose);
    if (choices.length === 0) {
        console.log('GPG is available, but no GPG/PGP-looking items were found in 1Password.');
        console.log('Set STAMHOOFD_DB_EXPORT_GPG_RECIPIENT or pass --recipient when exporting.');
        return;
    }

    const selected = await select({
        message: 'Select a 1Password GPG public key to import',
        choices: choices.map(choice => ({ name: choice.name, value: choice.value })),
    });
    const recipient = await importOnePasswordPublicKey(selected, context);
    console.log(`GPG recipient ready: ${recipient}`);
}

async function listLocalGpgRecipients(verbose: boolean): Promise<GpgChoice[]> {
    const result = await run('gpg', ['--list-keys', '--with-colons'], { capture: true, allowFailure: true });
    if (result.status !== 0) {
        if (verbose) {
            console.log(`gpg --list-keys failed with status ${result.status}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ''}`);
        }
        return [];
    }

    const choices: GpgChoice[] = [];
    let fingerprint = '';
    let uid = '';
    for (const line of result.stdout.split('\n')) {
        const parts = line.split(':');
        if (parts[0] === 'fpr') {
            fingerprint = parts[9] ?? '';
        }
        if (parts[0] === 'uid') {
            uid = parts[9] ?? '';
            if (fingerprint) {
                choices.push({ name: `${uid || fingerprint} (local GPG)`, value: fingerprint, source: 'gpg' });
            }
        }
    }
    if (verbose) {
        console.log(`gpg --list-keys returned ${choices.length} recipient${choices.length === 1 ? '' : 's'}.`);
    }
    return choices;
}

async function listOnePasswordGpgChoices(verbose: boolean): Promise<GpgChoice[]> {
    const result = await run('op', ['item', 'list', '--format', 'json'], { capture: true, allowFailure: true });
    if (result.status !== 0) {
        if (verbose) {
            console.log(`op item list failed with status ${result.status}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ''}`);
            console.log('Make sure the 1Password CLI is installed and signed in: op account list');
        }
        return [];
    }

    let items: OnePasswordItem[];
    try {
        items = JSON.parse(result.stdout) as OnePasswordItem[];
    }
    catch (error) {
        if (verbose) {
            console.log(`Could not parse op item list JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
        return [];
    }

    const matches = items.filter(item => /gpg|pgp/i.test(`${item.title ?? ''} ${item.category ?? ''}`));
    if (verbose) {
        console.log(`1Password returned ${items.length} item${items.length === 1 ? '' : 's'}.`);
        console.log(`Items matching /gpg|pgp/i in title or category: ${matches.length}.`);
        if (matches.length > 0) {
            for (const item of matches) {
                console.log(`  - ${item.title ?? item.id}${item.category ? ` [${item.category}]` : ''}${item.vault?.name ? ` in ${item.vault.name}` : ''}`);
            }
        }
        else if (items.length > 0) {
            console.log('No 1Password item title/category contains "gpg" or "pgp". Rename the item or pass --recipient directly.');
        }
    }

    return matches.map(item => ({
            name: `${item.title ?? item.id}${item.vault?.name ? ` (${item.vault.name} in 1Password)` : ' (1Password)'}`,
            value: item.id,
            source: '1password' as const,
        }));
}

async function importOnePasswordPublicKey(itemId: string, context: CliContext): Promise<string> {
    const result = await run('op', ['item', 'get', itemId, '--format', 'json'], { capture: true });
    const publicKey = findPublicKeyBlock(JSON.parse(result.stdout));
    if (!publicKey) {
        throw new Error('Selected 1Password item does not contain a PGP public key block.');
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stamhoofd-gpg-'));
    const keyFile = path.join(tempDir, 'public-key.asc');
    try {
        await fs.writeFile(keyFile, publicKey, { mode: 0o600 });
        await run('gpg', ['--import', keyFile], { verbose: context.verbose });
        return await fingerprintFromKeyFile(keyFile) || itemId;
    }
    finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

async function fingerprintFromKeyFile(keyFile: string): Promise<string> {
    const result = await run('gpg', ['--show-keys', '--with-colons', keyFile], { capture: true, allowFailure: true });
    if (result.status !== 0) {
        return '';
    }
    return result.stdout.split('\n').find(line => line.startsWith('fpr:'))?.split(':')[9] ?? '';
}

function findPublicKeyBlock(value: unknown): string {
    if (typeof value === 'string') {
        const match = value.match(/-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]+?-----END PGP PUBLIC KEY BLOCK-----/);
        return match?.[0] ?? '';
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const result = findPublicKeyBlock(item);
            if (result) {
                return result;
            }
        }
    }
    if (value && typeof value === 'object') {
        for (const item of Object.values(value)) {
            const result = findPublicKeyBlock(item);
            if (result) {
                return result;
            }
        }
    }
    return '';
}
