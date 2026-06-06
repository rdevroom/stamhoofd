import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { input, select } from '@inquirer/prompts';
import type { CliContext } from '../context/create-context.js';
import { run } from './command-runner.js';

type GpgChoice = {
    name: string;
    value: string;
    source: 'gpg' | '1password';
};

type CheckResult = {
    ok: boolean;
    details: string;
    manualFix?: string;
};

type OnePasswordVault = {
    id: string;
    name?: string;
};

type OnePasswordAccount = {
    url?: string;
    email?: string;
    user_uuid?: string;
    account_uuid?: string;
};

type OnePasswordItem = {
    id: string;
    title?: string;
    category?: string;
    vault?: { id?: string; name?: string };
};

const importFromOnePassword = '__stamhoofd_import_from_1password__';
const enterManualRecipient = '__stamhoofd_enter_manual_recipient__';
const searchAgain = '__stamhoofd_search_again__';
const showAllItems = '__stamhoofd_show_all_items__';
const cancelSelection = '__stamhoofd_cancel_selection__';
const searchAllVaults = '__stamhoofd_search_all_vaults__';
const chooseVault = '__stamhoofd_choose_vault__';
const retryOnePassword = '__stamhoofd_retry_1password__';
const importPrivateKeyFromOnePassword = '__stamhoofd_import_private_key_from_1password__';
const retryExistingPrivateKey = '__stamhoofd_retry_existing_private_key__';

export type GpgDecryptOptions = {
    gpgHome?: string;
    cleanup?: () => Promise<void>;
};

export async function resolveGpgRecipient(options: { flag?: string; context: CliContext }): Promise<string> {
    if (options.flag) {
        return options.flag;
    }
    if (process.env.STAMHOOFD_DB_EXPORT_GPG_RECIPIENT) {
        return process.env.STAMHOOFD_DB_EXPORT_GPG_RECIPIENT;
    }

    const localRecipients = await listLocalGpgRecipients(options.context.verbose);
    const choices = [
        ...localRecipients.map(choice => ({ name: choice.name, value: choice.value })),
        { name: 'Import public key from 1Password', value: importFromOnePassword },
        { name: 'Enter recipient manually', value: enterManualRecipient },
    ];

    if (localRecipients.length === 0 && !(await onePasswordCliAvailable(options.context.verbose))) {
        return await promptManualRecipient();
    }

    if (choices.length === 0) {
        throw new Error('No GPG recipients found. Pass --recipient or set STAMHOOFD_DB_EXPORT_GPG_RECIPIENT.');
    }

    const selected = await select({
        message: 'Select the GPG recipient for encryption',
        choices,
    });

    if (selected === importFromOnePassword) {
        return await selectOnePasswordPublicKey(options.context);
    }
    if (selected === enterManualRecipient) {
        return await promptManualRecipient();
    }

    return selected;
}

export async function checkGpgEncryptionSupport(context: CliContext): Promise<CheckResult> {
    const gpg = await checkGpgSupport();
    if (!gpg.ok) {
        return gpg;
    }

    const localRecipients = await listLocalGpgRecipients(context.verbose);
    if (localRecipients.length > 0) {
        return { ok: true, details: `${localRecipients.length} local recipient${localRecipients.length === 1 ? '' : 's'}` };
    }

    if (await onePasswordCliAvailable(context.verbose)) {
        return { ok: true, details: 'no local recipients; 1Password available during export' };
    }

    return { ok: false, details: 'no local recipients and 1Password unavailable', manualFix: 'Use --recipient or sign in with op account list' };
}

export async function checkGpgSupport(): Promise<CheckResult> {
    const version = await run('gpg', ['--version'], { capture: true, allowFailure: true });
    if (version.status !== 0) {
        return { ok: false, details: 'gpg not found', manualFix: 'Install GPG to use encrypted database exports' };
    }

    return { ok: true, details: version.stdout.split('\n')[0]?.trim() || 'gpg available' };
}

export async function resolveGpgDecryptOptions(options: { file: string; context: CliContext }): Promise<GpgDecryptOptions> {
    const local = await checkGpgDecrypt(options.file, undefined, options.context.verbose);
    if (local.ok) {
        return {};
    }
    if (!/No secret key/i.test(local.stderr)) {
        throw new Error(local.stderr.trim() || 'GPG could not decrypt this export.');
    }

    while (true) {
        const action = await select({
            message: `No local private key can decrypt this export${formatMissingSecretKey(local.stderr)}.`,
            choices: [
                { name: 'Use a private key from 1Password', value: importPrivateKeyFromOnePassword },
                { name: 'Retry with existing local GPG key', value: retryExistingPrivateKey },
                { name: 'Cancel', value: cancelSelection },
            ],
        });
        if (action === retryExistingPrivateKey) {
            const retry = await checkGpgDecrypt(options.file, undefined, options.context.verbose);
            if (retry.ok) {
                return {};
            }
            if (!/No secret key/i.test(retry.stderr)) {
                throw new Error(retry.stderr.trim() || 'GPG could not decrypt this export.');
            }
            continue;
        }
        if (action === cancelSelection) {
            throw new Error('Database export import cancelled.');
        }

        const resolved = await createTemporaryGpgHomeFromOnePasswordPrivateKey(options.context);
        const retry = await checkGpgDecrypt(options.file, resolved.gpgHome, options.context.verbose);
        if (retry.ok) {
            return resolved;
        }
        await resolved.cleanup?.();
        if (!/No secret key/i.test(retry.stderr)) {
            throw new Error(retry.stderr.trim() || 'GPG could not decrypt this export after importing the private key.');
        }
    }
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

async function onePasswordCliAvailable(verbose: boolean): Promise<boolean> {
    const accounts = await listOnePasswordAccounts(verbose);
    return accounts.length > 0;
}

async function listOnePasswordAccounts(verbose: boolean): Promise<OnePasswordAccount[]> {
    const result = await run('op', ['account', 'list', '--format', 'json'], { capture: true, allowFailure: true });
    if (result.status !== 0) {
        if (verbose) {
            console.log(`op account list failed with status ${result.status}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ''}`);
            console.log('Make sure the 1Password CLI is installed and signed in: op account list');
        }
        return [];
    }

    try {
        const accounts = JSON.parse(result.stdout) as OnePasswordAccount[];
        if (verbose) {
            console.log(`1Password returned ${accounts.length} account${accounts.length === 1 ? '' : 's'}.`);
        }
        return accounts;
    }
    catch (error) {
        if (verbose) {
            console.log(`Could not parse op account list JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
        return [];
    }
}

async function selectOnePasswordAccount(verbose: boolean): Promise<string | undefined> {
    const accounts = await listOnePasswordAccounts(verbose);
    if (accounts.length === 0) {
        throw new Error('No signed-in 1Password accounts found.');
    }
    if (accounts.length === 1) {
        return onePasswordAccountValue(accounts[0]);
    }

    return await select({
        message: 'Select a 1Password account',
        choices: accounts.map(account => ({ name: formatOnePasswordAccount(account), value: onePasswordAccountValue(account) ?? '' })),
    }) || undefined;
}

async function listOnePasswordVaults(options: { account?: string; verbose: boolean }): Promise<OnePasswordVault[]> {
    const result = await run('op', withOnePasswordAccount(['vault', 'list', '--format', 'json'], options.account), { capture: true, allowFailure: true });
    if (result.status !== 0) {
        throw new Error(`op vault list failed${result.stderr.trim() ? `: ${result.stderr.trim()}` : ''}`);
    }
    try {
        const vaults = JSON.parse(result.stdout) as OnePasswordVault[];
        if (options.verbose) {
            console.log(`1Password returned ${vaults.length} vault${vaults.length === 1 ? '' : 's'}.`);
        }
        return vaults;
    }
    catch (error) {
        throw new Error(`Could not parse op vault list JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function listOnePasswordItems(options: { account?: string; vaultId?: string; verbose: boolean }): Promise<OnePasswordItem[]> {
    const args = ['item', 'list', '--format', 'json'];
    if (options.account) {
        args.push('--account', options.account);
    }
    if (options.vaultId) {
        args.push('--vault', options.vaultId);
    }
    const result = await run('op', args, { capture: true, allowFailure: true });
    if (result.status !== 0) {
        throw new Error(`op item list failed${result.stderr.trim() ? `: ${result.stderr.trim()}` : ''}`);
    }
    try {
        const items = JSON.parse(result.stdout) as OnePasswordItem[];
        if (options.verbose) {
            console.log(`1Password returned ${items.length} item${items.length === 1 ? '' : 's'}.`);
        }
        return items;
    }
    catch (error) {
        throw new Error(`Could not parse op item list JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function selectOnePasswordPublicKey(context: CliContext): Promise<string> {
    while (true) {
        try {
            const selection = await selectOnePasswordItem(context);
            return await importOnePasswordPublicKey(selection.item, context, selection.account);
        }
        catch (error) {
            const action = await select({
                message: error instanceof Error ? error.message : String(error),
                choices: [
                    { name: 'Try again', value: retryOnePassword },
                    { name: 'Enter recipient manually', value: enterManualRecipient },
                    { name: 'Cancel export', value: cancelSelection },
                ],
            });
            if (action === enterManualRecipient) {
                return await promptManualRecipient();
            }
            if (action === cancelSelection) {
                throw new Error('Database export cancelled.');
            }
        }
    }
}

async function selectOnePasswordItem(context: CliContext): Promise<{ account?: string; item: OnePasswordItem }> {
    const account = await selectOnePasswordAccount(context.verbose);
    const scope = await select({
        message: 'Where should Stamhoofd look in 1Password?',
        choices: [
            { name: 'Search all vaults', value: searchAllVaults },
            { name: 'Choose a vault first', value: chooseVault },
        ],
    });
    const vaultId = scope === chooseVault ? await selectOnePasswordVault({ account, verbose: context.verbose }) : undefined;
    const items = await listOnePasswordItems({ account, vaultId, verbose: context.verbose });
    return { account, item: await searchOnePasswordItems(items) };
}

async function selectOnePasswordVault(options: { account?: string; verbose: boolean }): Promise<string> {
    const vaults = await listOnePasswordVaults(options);
    if (vaults.length === 0) {
        throw new Error('No 1Password vaults found.');
    }
    return await select({
        message: 'Select a 1Password vault',
        choices: vaults.map(vault => ({ name: vault.name ?? vault.id, value: vault.id })),
    });
}

async function searchOnePasswordItems(items: OnePasswordItem[]): Promise<OnePasswordItem> {
    if (items.length === 0) {
        throw new Error('No 1Password items found.');
    }

    let query = '';
    while (true) {
        query = await input({ message: 'Search 1Password items by name', default: query });
        const matches = filterOnePasswordItems(items, query);
        const selected = await select({
            message: matches.length === 0 ? `No items matched "${query}".` : `Found ${matches.length} matching item${matches.length === 1 ? '' : 's'}`,
            choices: [
                ...matches.map((item, index) => ({ name: formatOnePasswordItem(item), value: String(index) })),
                { name: 'Search again', value: searchAgain },
                { name: 'Show all items', value: showAllItems },
                { name: 'Cancel', value: cancelSelection },
            ],
        });

        if (selected === searchAgain) {
            continue;
        }
        if (selected === showAllItems) {
            query = '';
            const allSelected = await select({
                message: 'Select a 1Password item',
                choices: [
                    ...items.map((item, index) => ({ name: formatOnePasswordItem(item), value: String(index) })),
                    { name: 'Search again', value: searchAgain },
                    { name: 'Cancel', value: cancelSelection },
                ],
            });
            if (allSelected === searchAgain) {
                continue;
            }
            if (allSelected === cancelSelection) {
                throw new Error('Database export cancelled.');
            }
            return items[Number(allSelected)];
        }
        if (selected === cancelSelection) {
            throw new Error('Database export cancelled.');
        }
        return matches[Number(selected)];
    }
}

function filterOnePasswordItems(items: OnePasswordItem[], query: string): OnePasswordItem[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return items;
    }
    return items.filter(item => `${item.title ?? ''} ${item.category ?? ''} ${item.vault?.name ?? ''}`.toLowerCase().includes(normalized));
}

function formatOnePasswordItem(item: OnePasswordItem): string {
    return `${item.title ?? item.id}${item.vault?.name ? ` (${item.vault.name}${item.category ? `, ${item.category}` : ''})` : item.category ? ` (${item.category})` : ''}`;
}

async function importOnePasswordPublicKey(item: OnePasswordItem, context: CliContext, account?: string): Promise<string> {
    const args = ['item', 'get', item.id, '--format', 'json'];
    if (account) {
        args.push('--account', account);
    }
    if (item.vault?.id) {
        args.push('--vault', item.vault.id);
    }
    const result = await run('op', args, { capture: true });
    const publicKey = findPublicKeyBlock(JSON.parse(result.stdout));
    if (!publicKey) {
        throw new Error('Selected 1Password item does not contain a PGP public key block.');
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stamhoofd-gpg-'));
    const keyFile = path.join(tempDir, 'public-key.asc');
    try {
        await fs.writeFile(keyFile, publicKey, { mode: 0o600 });
        await run('gpg', ['--import', keyFile], { verbose: context.verbose });
        return await fingerprintFromKeyFile(keyFile) || item.id;
    }
    finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

async function createTemporaryGpgHomeFromOnePasswordPrivateKey(context: CliContext): Promise<GpgDecryptOptions> {
    while (true) {
        try {
            const selection = await selectOnePasswordItem(context);
            return await importOnePasswordPrivateKey(selection.item, context, selection.account);
        }
        catch (error) {
            const action = await select({
                message: error instanceof Error ? error.message : String(error),
                choices: [
                    { name: 'Try again', value: retryOnePassword },
                    { name: 'Cancel', value: cancelSelection },
                ],
            });
            if (action === cancelSelection) {
                throw new Error('Database export import cancelled.');
            }
        }
    }
}

async function importOnePasswordPrivateKey(item: OnePasswordItem, context: CliContext, account?: string): Promise<GpgDecryptOptions> {
    const args = ['item', 'get', item.id, '--format', 'json'];
    if (account) {
        args.push('--account', account);
    }
    if (item.vault?.id) {
        args.push('--vault', item.vault.id);
    }
    const result = await run('op', args, { capture: true });
    const privateKey = findPrivateKeyBlock(JSON.parse(result.stdout));
    if (!privateKey) {
        throw new Error('Selected 1Password item does not contain a PGP private key block.');
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stamhoofd-gpg-'));
    const gpgHome = path.join(tempDir, 'gnupg');
    const keyFile = path.join(tempDir, 'private-key.asc');
    try {
        await fs.mkdir(gpgHome, { mode: 0o700 });
        await fs.writeFile(keyFile, privateKey, { mode: 0o600 });
        await run('gpg', ['--homedir', gpgHome, '--batch', '--import', keyFile], { verbose: context.verbose });
        await fs.rm(keyFile, { force: true });
        return {
            gpgHome,
            cleanup: async () => await fs.rm(tempDir, { recursive: true, force: true }),
        };
    }
    catch (error) {
        await fs.rm(tempDir, { recursive: true, force: true });
        throw error;
    }
}

function withOnePasswordAccount(args: string[], account: string | undefined): string[] {
    return account ? [...args, '--account', account] : args;
}

function onePasswordAccountValue(account: OnePasswordAccount): string | undefined {
    return account.url ?? account.account_uuid ?? account.email;
}

function formatOnePasswordAccount(account: OnePasswordAccount): string {
    const label = account.email ?? account.user_uuid ?? account.account_uuid ?? account.url ?? '1Password account';
    return account.url ? `${label} (${account.url})` : label;
}

async function promptManualRecipient(): Promise<string> {
    return await input({
        message: 'Enter GPG recipient email, key id, or fingerprint',
        validate: value => value.trim() ? true : 'Enter a GPG recipient.',
    });
}

async function fingerprintFromKeyFile(keyFile: string): Promise<string> {
    const result = await run('gpg', ['--show-keys', '--with-colons', keyFile], { capture: true, allowFailure: true });
    if (result.status !== 0) {
        return '';
    }
    return result.stdout.split('\n').find(line => line.startsWith('fpr:'))?.split(':')[9] ?? '';
}

async function checkGpgDecrypt(file: string, gpgHome: string | undefined, verbose: boolean): Promise<{ ok: boolean; stderr: string }> {
    const result = await run('gpg', [...(gpgHome ? ['--homedir', gpgHome] : []), '--batch', '--decrypt', '--output', os.devNull, file], { capture: true, allowFailure: true, verbose });
    return { ok: result.status === 0, stderr: result.stderr };
}

function formatMissingSecretKey(stderr: string): string {
    const key = stderr.split('\n').find(line => /encrypted with/i.test(line))?.trim();
    const user = stderr.split('\n').find(line => line.trim().startsWith('"'))?.trim();
    const details = [key, user].filter(Boolean).join(' ');
    return details ? ` (${details})` : '';
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

function findPrivateKeyBlock(value: unknown): string {
    if (typeof value === 'string') {
        const match = value.match(/-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]+?-----END PGP PRIVATE KEY BLOCK-----/);
        return match?.[0] ?? '';
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            const result = findPrivateKeyBlock(item);
            if (result) {
                return result;
            }
        }
    }
    if (value && typeof value === 'object') {
        for (const item of Object.values(value)) {
            const result = findPrivateKeyBlock(item);
            if (result) {
                return result;
            }
        }
    }
    return '';
}
