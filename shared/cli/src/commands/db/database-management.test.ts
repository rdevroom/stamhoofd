import { beforeEach, describe, expect, it, vi } from 'vitest';
import DbCopy from './copy.js';
import DbExport from './export.js';
import DbImport from './import.js';
import DbMove from './move.js';
import DbRemove from './remove.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { confirm, input, select } from '@inquirer/prompts';
import { run } from '../../runtime/command-runner.js';
import { resetContainerRuntimeCacheForTests } from '../../services/docker.js';

vi.mock('@inquirer/prompts', () => ({
    input: vi.fn(),
    confirm: vi.fn(),
    select: vi.fn(),
}));

vi.mock('../../runtime/command-runner.js', () => ({
    run: vi.fn(),
}));

describe('database management commands', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetContainerRuntimeCacheForTests();
        vi.mocked(run).mockImplementation(async (_command, args) => {
            if (args[0] === '--version') {
                if (_command === 'podman') {
                    return { stdout: 'podman version 5.0.0', stderr: '', status: 0 };
                }
                if (_command === 'gzip') {
                    return { stdout: 'gzip 1.12\n', stderr: '', status: 0 };
                }
                if (_command === 'gpg') {
                    return { stdout: 'gpg (GnuPG) 2.4.0\n', stderr: '', status: 0 };
                }
            }
            if (args.includes('SHOW DATABASES;')) {
                return { stdout: 'source-db\nother-db\n', stderr: '', status: 0 };
            }
            if (_command === 'gpg' && args[0] === '--list-keys') {
                return { stdout: 'fpr:::::::::fingerprint-0:\nuid:::::::::Dev <dev@example.com>:', stderr: '', status: 0 };
            }
            if (_command === 'op' && args[0] === 'account' && args[1] === 'list') {
                return { stdout: JSON.stringify([{ email: 'dev@example.com', url: 'stamhoofd.1password.eu' }]), stderr: '', status: 0 };
            }
            if (_command === 'op' && args[0] === 'item' && args[1] === 'list') {
                return { stdout: JSON.stringify([{ id: 'item-1', title: 'Database backup key', category: 'Secure Note', vault: { id: 'vault-1', name: 'Engineering' } }]), stderr: '', status: 0 };
            }
            if (_command === 'op' && args[0] === 'item' && args[1] === 'get') {
                return { stdout: JSON.stringify({ fields: [{ value: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nkey\n-----END PGP PUBLIC KEY BLOCK-----' }] }), stderr: '', status: 0 };
            }
            if (_command === 'gpg' && args[0] === '--show-keys') {
                return { stdout: 'fpr:::::::::imported-fingerprint:\n', stderr: '', status: 0 };
            }
            if (args.some(arg => arg.includes('INFORMATION_SCHEMA.SCHEMATA'))) {
                return { stdout: '', stderr: '', status: 0 };
            }
            if (args.some(arg => arg.includes('INFORMATION_SCHEMA.TABLES'))) {
                return { stdout: 'members\norganizations\n', stderr: '', status: 0 };
            }
            if (args.some(arg => arg.includes('INFORMATION_SCHEMA.COLUMNS'))) {
                return { stdout: 'id\nname\n', stderr: '', status: 0 };
            }
            return undefined;
        });
        vi.mocked(confirm).mockResolvedValue(true);
    });

    it('copies a database from explicit flags without prompting', async () => {
        const command = createCommand(DbCopy, { from: 'source-db', to: 'target-db' });

        await command.run();

        expect(select).not.toHaveBeenCalled();
        expect(run).toHaveBeenNthCalledWith(1, 'podman', ['--version'], { capture: true, allowFailure: true });
        expect(run).toHaveBeenNthCalledWith(2, 'podman', ['info'], { quiet: true });
        expect(run).toHaveBeenCalledWith('podman', ['exec', 'stamhoofd-mysql', 'mysql', '-h127.0.0.1', '-uroot', '-proot', '-e', 'CREATE DATABASE IF NOT EXISTS `target-db` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;'], expect.anything());
        expect(run).toHaveBeenCalledWith('podman', ['exec', 'stamhoofd-mysql', 'sh', '-c', "mysqldump -h'127.0.0.1' -u'root' -p'root' --single-transaction --no-data --routines --triggers --events 'source-db' | mysql -h'127.0.0.1' -u'root' -p'root' 'target-db'"], expect.anything());
        expect(run).toHaveBeenCalledWith('podman', ['exec', 'stamhoofd-mysql', 'mysql', '-h127.0.0.1', '-uroot', '-proot', '-e', 'SET FOREIGN_KEY_CHECKS=0; INSERT INTO `target-db`.`members` (`id`, `name`) SELECT `id`, `name` FROM `source-db`.`members`; SET FOREIGN_KEY_CHECKS=1;'], expect.anything());
    });

    it('fails copy when the target database exists without force', async () => {
        vi.mocked(run).mockImplementation(async (_command, args) => {
            if (args[0] === '--version') {
                return { stdout: 'podman version 5.0.0', stderr: '', status: 0 };
            }
            if (args.some(arg => arg.includes('INFORMATION_SCHEMA.SCHEMATA'))) {
                return { stdout: 'target-db\n', stderr: '', status: 0 };
            }
            return undefined;
        });
        const command = createCommand(DbCopy, { from: 'source-db', to: 'target-db' });

        await expect(command.run()).rejects.toThrow('Target database target-db already exists');
    });

    it('drops existing target when copy uses force', async () => {
        vi.mocked(run).mockImplementation(async (_command, args) => {
            if (args[0] === '--version') {
                return { stdout: 'podman version 5.0.0', stderr: '', status: 0 };
            }
            if (args.some(arg => arg.includes('INFORMATION_SCHEMA.SCHEMATA'))) {
                return { stdout: 'target-db\n', stderr: '', status: 0 };
            }
            if (args.some(arg => arg.includes('INFORMATION_SCHEMA.TABLES')) || args.some(arg => arg.includes('INFORMATION_SCHEMA.COLUMNS'))) {
                return { stdout: '', stderr: '', status: 0 };
            }
            return undefined;
        });
        const command = createCommand(DbCopy, { from: 'source-db', to: 'target-db', force: true });

        await command.run();

        expect(run).toHaveBeenCalledWith('podman', ['exec', 'stamhoofd-mysql', 'mysql', '-h127.0.0.1', '-uroot', '-proot', '-e', 'DROP DATABASE IF EXISTS `target-db`;'], expect.anything());
    });

    it('moves a database by copying and dropping the source', async () => {
        const command = createCommand(DbMove, { from: 'source-db', to: 'target-db' });

        await command.run();

        expect(run).toHaveBeenCalledWith('podman', ['exec', 'stamhoofd-mysql', 'mysql', '-h127.0.0.1', '-uroot', '-proot', '-e', 'RENAME TABLE `source-db`.`members` TO `target-db`.`members`, `source-db`.`organizations` TO `target-db`.`organizations`;'], expect.anything());
        expect(run).toHaveBeenCalledWith('podman', ['exec', 'stamhoofd-mysql', 'mysql', '-h127.0.0.1', '-uroot', '-proot', '-e', 'DROP DATABASE IF EXISTS `source-db`;'], expect.anything());
    });

    it('exports a selected database with gzip and gpg', async () => {
        const command = createCommand(DbExport, { from: 'source-db', output: '/tmp/source-db.sql.gz.gpg', gzip: true, encrypt: true, recipient: 'dev@example.com' });

        await command.run();

        expect(run).toHaveBeenCalledWith('sh', ['-c', "'podman' exec 'stamhoofd-mysql' mysqldump -h'127.0.0.1' -u'root' -p'root' --single-transaction --quick --routines --triggers --events 'source-db' | gzip -c | gpg --batch --yes --trust-model always --encrypt --recipient 'dev@example.com' > '/tmp/source-db.sql.gz.gpg'"], expect.anything());
    });

    it('exports with an interactively selected local GPG recipient', async () => {
        vi.mocked(select).mockResolvedValueOnce('fingerprint-0');
        const command = createCommand(DbExport, { from: 'source-db', output: '/tmp/source-db.sql.gz.gpg', gzip: true, encrypt: true });

        await command.run();

        expect(select).toHaveBeenCalledWith({
            message: 'Select the GPG recipient for encryption',
            choices: [
                { name: 'Dev <dev@example.com> (local GPG)', value: 'fingerprint-0' },
                { name: 'Import public key from 1Password', value: '__stamhoofd_import_from_1password__' },
                { name: 'Enter recipient manually', value: '__stamhoofd_enter_manual_recipient__' },
            ],
        });
        expect(run).toHaveBeenCalledWith('sh', ['-c', "'podman' exec 'stamhoofd-mysql' mysqldump -h'127.0.0.1' -u'root' -p'root' --single-transaction --quick --routines --triggers --events 'source-db' | gzip -c | gpg --batch --yes --trust-model always --encrypt --recipient 'fingerprint-0' > '/tmp/source-db.sql.gz.gpg'"], expect.anything());
    });

    it('uses STAMHOOFD_DB_EXPORT_GPG_RECIPIENT without prompting', async () => {
        const previous = process.env.STAMHOOFD_DB_EXPORT_GPG_RECIPIENT;
        process.env.STAMHOOFD_DB_EXPORT_GPG_RECIPIENT = 'env@example.com';
        const command = createCommand(DbExport, { from: 'source-db', output: '/tmp/source-db.sql.gz.gpg', gzip: true, encrypt: true });

        try {
            await command.run();
        } finally {
            if (previous === undefined) {
                delete process.env.STAMHOOFD_DB_EXPORT_GPG_RECIPIENT;
            } else {
                process.env.STAMHOOFD_DB_EXPORT_GPG_RECIPIENT = previous;
            }
        }

        expect(select).not.toHaveBeenCalled();
        expect(run).toHaveBeenCalledWith('sh', ['-c', "'podman' exec 'stamhoofd-mysql' mysqldump -h'127.0.0.1' -u'root' -p'root' --single-transaction --quick --routines --triggers --events 'source-db' | gzip -c | gpg --batch --yes --trust-model always --encrypt --recipient 'env@example.com' > '/tmp/source-db.sql.gz.gpg'"], expect.anything());
    });

    it('imports a searched 1Password public key before exporting', async () => {
        vi.mocked(select)
            .mockResolvedValueOnce('__stamhoofd_import_from_1password__')
            .mockResolvedValueOnce('__stamhoofd_search_all_vaults__')
            .mockResolvedValueOnce('0');
        vi.mocked(input).mockResolvedValueOnce('backup');
        const command = createCommand(DbExport, { from: 'source-db', output: '/tmp/source-db.sql.gz.gpg', gzip: true, encrypt: true });

        await command.run();

        expect(run).toHaveBeenCalledWith('op', ['item', 'list', '--format', 'json', '--account', 'stamhoofd.1password.eu'], { capture: true, allowFailure: true });
        expect(run).toHaveBeenCalledWith('op', ['item', 'get', 'item-1', '--format', 'json', '--account', 'stamhoofd.1password.eu', '--vault', 'vault-1'], { capture: true });
        expect(run).toHaveBeenCalledWith('gpg', ['--import', expect.stringContaining('public-key.asc')], { verbose: false });
        expect(run).toHaveBeenCalledWith('sh', ['-c', "'podman' exec 'stamhoofd-mysql' mysqldump -h'127.0.0.1' -u'root' -p'root' --single-transaction --quick --routines --triggers --events 'source-db' | gzip -c | gpg --batch --yes --trust-model always --encrypt --recipient 'imported-fingerprint' > '/tmp/source-db.sql.gz.gpg'"], expect.anything());
    });

    it('asks interactively for gzip and encryption when flags are omitted', async () => {
        vi.mocked(select).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        vi.mocked(input).mockResolvedValueOnce('/tmp/manual-name');
        const command = createCommand(DbExport, { from: 'source-db' });

        await command.run();

        expect(select).toHaveBeenNthCalledWith(1, {
            message: 'Compress export with gzip?',
            choices: [
                { name: 'No', value: false },
                { name: 'Yes', value: true },
            ],
        });
        expect(select).toHaveBeenNthCalledWith(2, {
            message: 'Encrypt export with GPG?',
            choices: [
                { name: 'No', value: false },
                { name: 'Yes', value: true },
            ],
        });
        expect(run).toHaveBeenCalledWith('sh', ['-c', "'podman' exec 'stamhoofd-mysql' mysqldump -h'127.0.0.1' -u'root' -p'root' --single-transaction --quick --routines --triggers --events 'source-db' | gzip -c > '/tmp/manual-name.sql.gz'"], expect.anything());
    });

    it('adds missing extensions to an explicit output path', async () => {
        const command = createCommand(DbExport, { from: 'source-db', output: '/tmp/backup', gzip: true, encrypt: true, recipient: 'dev@example.com' });

        await command.run();

        expect(run).toHaveBeenCalledWith('sh', ['-c', "'podman' exec 'stamhoofd-mysql' mysqldump -h'127.0.0.1' -u'root' -p'root' --single-transaction --quick --routines --triggers --events 'source-db' | gzip -c | gpg --batch --yes --trust-model always --encrypt --recipient 'dev@example.com' > '/tmp/backup.sql.gz.gpg'"], expect.anything());
    });

    it('disables interactive gzip when the requirement is missing', async () => {
        vi.mocked(run).mockImplementation(async (_command, args) => {
            if (_command === 'gzip' && args[0] === '--version') {
                return { stdout: '', stderr: 'missing', status: 1 };
            }
            if (_command === 'gpg' && args[0] === '--version') {
                return { stdout: 'gpg (GnuPG) 2.4.0\n', stderr: '', status: 0 };
            }
            if (_command === 'gpg' && args[0] === '--list-keys') {
                return { stdout: 'fpr:::::::::fingerprint-0:\nuid:::::::::Dev <dev@example.com>:', stderr: '', status: 0 };
            }
            if (_command === 'podman' && args[0] === '--version') {
                return { stdout: 'podman version 5.0.0', stderr: '', status: 0 };
            }
            if (args.includes('SHOW DATABASES;')) {
                return { stdout: 'source-db\n', stderr: '', status: 0 };
            }
            return undefined;
        });
        vi.mocked(select).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
        vi.mocked(input).mockResolvedValueOnce('/tmp/backup');
        const command = createCommand(DbExport, { from: 'source-db' });

        await command.run();

        expect(select).toHaveBeenNthCalledWith(1, {
            message: 'Compress export with gzip?',
            choices: [
                { name: 'No', value: false },
                { name: 'Yes (requirement not met, run `stam setup` for more info.)', value: true, disabled: true },
            ],
        });
    });

    it('fails explicit encryption when the requirement is missing', async () => {
        vi.mocked(run).mockImplementation(async (_command, args) => {
            if (_command === 'gzip' && args[0] === '--version') {
                return { stdout: 'gzip 1.12\n', stderr: '', status: 0 };
            }
            if (_command === 'gpg' && args[0] === '--version') {
                return { stdout: '', stderr: 'missing', status: 1 };
            }
            if (_command === 'podman' && args[0] === '--version') {
                return { stdout: 'podman version 5.0.0', stderr: '', status: 0 };
            }
            if (args.includes('SHOW DATABASES;')) {
                return { stdout: 'source-db\n', stderr: '', status: 0 };
            }
            return undefined;
        });
        const command = createCommand(DbExport, { from: 'source-db', output: '/tmp/backup', encrypt: true });

        await expect(command.run()).rejects.toThrow('Encrypt export with GPG requirement not met.');
    });

    it('prompts for the 1Password account when multiple accounts are available', async () => {
        vi.mocked(run).mockImplementation(async (_command, args) => {
            if (args[0] === '--version') {
                if (_command === 'podman') return { stdout: 'podman version 5.0.0', stderr: '', status: 0 };
                if (_command === 'gzip') return { stdout: 'gzip 1.12\n', stderr: '', status: 0 };
                if (_command === 'gpg') return { stdout: 'gpg (GnuPG) 2.4.0\n', stderr: '', status: 0 };
            }
            if (_command === 'gpg' && args[0] === '--list-keys') {
                return { stdout: '', stderr: '', status: 0 };
            }
            if (_command === 'op' && args[0] === 'account' && args[1] === 'list') {
                return { stdout: JSON.stringify([{ email: 'work@example.com', url: 'work.1password.eu' }, { email: 'personal@example.com', url: 'personal.1password.com' }]), stderr: '', status: 0 };
            }
            if (_command === 'op' && args[0] === 'item' && args[1] === 'list') {
                return { stdout: JSON.stringify([{ id: 'item-1', title: 'Database backup key', vault: { id: 'vault-1', name: 'Engineering' } }]), stderr: '', status: 0 };
            }
            if (_command === 'op' && args[0] === 'item' && args[1] === 'get') {
                return { stdout: JSON.stringify({ value: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nkey\n-----END PGP PUBLIC KEY BLOCK-----' }), stderr: '', status: 0 };
            }
            if (_command === 'gpg' && args[0] === '--show-keys') {
                return { stdout: 'fpr:::::::::imported-fingerprint:\n', stderr: '', status: 0 };
            }
            if (args.includes('SHOW DATABASES;')) {
                return { stdout: 'source-db\n', stderr: '', status: 0 };
            }
            return undefined;
        });
        vi.mocked(select)
            .mockResolvedValueOnce('__stamhoofd_import_from_1password__')
            .mockResolvedValueOnce('work.1password.eu')
            .mockResolvedValueOnce('__stamhoofd_search_all_vaults__')
            .mockResolvedValueOnce('0');
        vi.mocked(input).mockResolvedValueOnce('backup');
        const command = createCommand(DbExport, { from: 'source-db', output: '/tmp/source-db.sql.gz.gpg', gzip: true, encrypt: true });

        await command.run();

        expect(select).toHaveBeenCalledWith({
            message: 'Select a 1Password account',
            choices: [
                { name: 'work@example.com (work.1password.eu)', value: 'work.1password.eu' },
                { name: 'personal@example.com (personal.1password.com)', value: 'personal.1password.com' },
            ],
        });
        expect(run).toHaveBeenCalledWith('op', ['item', 'list', '--format', 'json', '--account', 'work.1password.eu'], { capture: true, allowFailure: true });
        expect(run).toHaveBeenCalledWith('op', ['item', 'get', 'item-1', '--format', 'json', '--account', 'work.1password.eu', '--vault', 'vault-1'], { capture: true });
    });

    it('imports a database export into a forced target', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stam-db-import-test-'));
        const inputFile = path.join(tempDir, 'backup.sql.gz.gpg');
        await fs.writeFile(inputFile, 'dump');
        const command = createCommand(DbImport, { input: inputFile, to: 'target-db', force: true });

        await command.run();

        expect(run).toHaveBeenCalledWith('sh', ['-c', `gpg --batch --decrypt '${inputFile}' | gzip -dc | 'podman' exec -i 'stamhoofd-mysql' mysql -h'127.0.0.1' -u'root' -p'root' 'target-db'`], expect.anything());
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('removes a database selected by explicit from flag', async () => {
        const command = createCommand(DbRemove, { from: 'source-db' });

        await command.run();

        expect(select).not.toHaveBeenCalled();
        expect(run).toHaveBeenCalledWith('podman', ['exec', 'stamhoofd-mysql', 'mysql', '-h127.0.0.1', '-uroot', '-proot', '-e', 'DROP DATABASE IF EXISTS `source-db`;'], expect.anything());
    });

    it('prompts for missing from and to databases', async () => {
        vi.mocked(select).mockResolvedValueOnce('source-db').mockResolvedValueOnce('stamhoofd-development');
        const command = createCommand(DbCopy, {});

        await command.run();

        expect(select).toHaveBeenNthCalledWith(1, {
            message: 'Select the database to copy from',
            choices: [
                { name: 'source-db', value: 'source-db' },
                { name: 'other-db', value: 'other-db' },
            ],
        });
        expect(select).toHaveBeenNthCalledWith(2, {
            message: 'Select the database to copy to',
            choices: [
                { name: 'source-db', value: 'source-db' },
                { name: 'other-db', value: 'other-db' },
                { name: 'stamhoofd-development (current setup)', value: 'stamhoofd-development' },
                { name: 'Enter a custom database name...', value: '__stamhoofd_custom_database__' },
            ],
        });
    });

    it('allows a custom target database name for missing to option', async () => {
        vi.mocked(select).mockResolvedValueOnce('source-db').mockResolvedValueOnce('__stamhoofd_custom_database__');
        vi.mocked(input).mockResolvedValueOnce('custom-target-db');
        const command = createCommand(DbCopy, {});

        await command.run();

        expect(input).toHaveBeenCalledWith({
            message: 'Enter the target database name',
            validate: expect.any(Function),
        });
        expect(run).toHaveBeenCalledWith('podman', ['exec', 'stamhoofd-mysql', 'mysql', '-h127.0.0.1', '-uroot', '-proot', '-e', 'CREATE DATABASE IF NOT EXISTS `custom-target-db` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;'], expect.anything());
    });

    it('marks existing current setup database in interactive choices', async () => {
        vi.mocked(run).mockImplementation(async (_command, args) => {
            if (args[0] === '--version') {
                return { stdout: 'podman version 5.0.0', stderr: '', status: 0 };
            }
            if (args.includes('SHOW DATABASES;')) {
                return { stdout: 'stamhoofd-development\nother-db\n', stderr: '', status: 0 };
            }
            return undefined;
        });
        vi.mocked(select).mockResolvedValueOnce('stamhoofd-development');
        const command = createCommand(DbRemove, {});

        await command.run();

        expect(select).toHaveBeenCalledWith({
            message: 'Select the database to remove',
            choices: [
                { name: 'stamhoofd-development (current setup)', value: 'stamhoofd-development' },
                { name: 'other-db', value: 'other-db' },
            ],
        });
    });
});

function createCommand<T extends DbCopy | DbMove | DbRemove | DbExport | DbImport>(CommandClass: new (argv: string[], config: any) => T, flags: { from?: string; to?: string; input?: string; output?: string; gzip?: boolean; encrypt?: boolean; recipient?: string; force?: boolean }): T {
    const command = new CommandClass([], {} as any);
    (command as any).config = {};
    (command as any).parse = vi.fn(async () => ({ flags: { env: 'stamhoofd', verbose: false, force: false, ...flags } }));
    (command as any).createContext = vi.fn(async () => ({
        rootDir: '/repo',
        generatedDir: '/repo/.development/cli/generated',
        env: 'stamhoofd',
        workspace: 'main',
        verbose: false,
        instance: {
            name: 'stamhoofd',
            prefix: '',
            primary: true,
            portOffset: 0,
        },
    }));
    command.log = vi.fn();
    return command;
}
