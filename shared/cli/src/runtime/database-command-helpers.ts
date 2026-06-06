import fs from 'node:fs/promises';
import { input, select } from '@inquirer/prompts';
import { buildBackendEnv } from '../config/build-config.js';
import { localIpv4Host, mysqlContainer, mysqlRootPassword, mysqlRootUser } from '../config/shared-service-config.js';
import * as docker from '../services/docker.js';
import { run as runCommand } from './command-runner.js';
import type { BaseCommand } from '../base-command.js';

type CommandContext = Awaited<ReturnType<BaseCommand['createContext']>>;

export function currentDatabase(context: CommandContext): string {
    return buildBackendEnv(context).DB_DATABASE ?? 'stamhoofd-development';
}

export async function listDatabases(): Promise<string[]> {
    const result = await docker.run(['exec', mysqlContainer, 'mysql', `-h${localIpv4Host}`, `-u${mysqlRootUser}`, `-p${mysqlRootPassword}`, '-N', '-B', '-e', 'SHOW DATABASES;'], { capture: true });
    return result.stdout
        .split('\n')
        .map(database => database.trim())
        .filter(database => database.length > 0);
}

const customDatabaseValue = '__stamhoofd_custom_database__';

export async function resolveDatabaseOption(options: { flag: string | undefined; message: string; current: string; includeCurrent: boolean; customInput?: boolean }): Promise<string> {
    if (options.flag) {
        return options.flag;
    }

    const databases = await listDatabases();
    const choices = options.includeCurrent && !databases.includes(options.current)
        ? [...databases, options.current]
        : databases;

    if (choices.length === 0) {
        throw new Error('No local MySQL databases found. Pass a database name explicitly.');
    }

    const selected = await select({
        message: options.message,
        choices: [
            ...choices.map(database => ({
                name: database === options.current ? `${database} (current setup)` : database,
                value: database,
            })),
            ...(options.customInput ? [{ name: 'Enter a custom database name...', value: customDatabaseValue }] : []),
        ],
    });

    if (selected !== customDatabaseValue) {
        return selected;
    }

    return await input({
        message: 'Enter the target database name',
        validate: value => value.trim().length > 0 || 'Enter a database name.',
    });
}

export async function createDatabase(database: string): Promise<void> {
    await runMysqlStatement(`CREATE DATABASE IF NOT EXISTS ${escapeIdentifier(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`);
}

export async function dropDatabase(database: string): Promise<void> {
    await runMysqlStatement(`DROP DATABASE IF EXISTS ${escapeIdentifier(database)};`);
}

export async function databaseExists(database: string): Promise<boolean> {
    const result = await runMysqlStatementCapture(`SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ${sqlString(database)};`);
    return result.stdout.trim().length > 0;
}

export async function ensureTargetDatabaseAvailable(database: string, options: { force: boolean }): Promise<void> {
    if (await databaseExists(database)) {
        if (!options.force) {
            throw new Error(`Target database ${database} already exists. Pass --force to drop and recreate it.`);
        }
        await dropDatabase(database);
    }
    await createDatabase(database);
}

export async function copyDatabase(from: string, to: string, options: { force: boolean }): Promise<void> {
    await ensureTargetDatabaseAvailable(to, options);

    await docker.run(['exec', mysqlContainer, 'sh', '-c', `mysqldump -h${shellQuote(localIpv4Host)} -u${shellQuote(mysqlRootUser)} -p${shellQuote(mysqlRootPassword)} --single-transaction --no-data --routines --triggers --events ${shellQuote(from)} | mysql -h${shellQuote(localIpv4Host)} -u${shellQuote(mysqlRootUser)} -p${shellQuote(mysqlRootPassword)} ${shellQuote(to)}`]);

    const tables = await listBaseTables(from);
    for (const table of tables) {
        const columns = await listInsertableColumns(from, table);
        if (columns.length === 0) {
            continue;
        }
        const columnList = columns.map(escapeIdentifier).join(', ');
        await runMysqlStatement(`SET FOREIGN_KEY_CHECKS=0; INSERT INTO ${escapeIdentifier(to)}.${escapeIdentifier(table)} (${columnList}) SELECT ${columnList} FROM ${escapeIdentifier(from)}.${escapeIdentifier(table)}; SET FOREIGN_KEY_CHECKS=1;`);
    }
}

export async function moveDatabase(from: string, to: string, options: { force: boolean }): Promise<void> {
    if (await hasNonTableObjects(from)) {
        await copyDatabase(from, to, options);
        await dropDatabase(from);
        return;
    }

    await ensureTargetDatabaseAvailable(to, options);
    const tables = await listBaseTables(from);
    if (tables.length > 0) {
        const renames = tables
            .map(table => `${escapeIdentifier(from)}.${escapeIdentifier(table)} TO ${escapeIdentifier(to)}.${escapeIdentifier(table)}`)
            .join(', ');
        await runMysqlStatement(`RENAME TABLE ${renames};`);
    }
    await dropDatabase(from);
}

export async function exportDatabase(database: string, options: { output: string; gzip: boolean; encrypt: boolean; recipient?: string; force: boolean; verbose?: boolean }): Promise<void> {
    if (!options.force) {
        await assertOutputDoesNotExist(options.output);
    }
    if (options.encrypt && !options.recipient) {
        throw new Error('A GPG recipient is required when encryption is enabled. Pass --recipient or configure one with stam setup gpg.');
    }

    const runtime = await docker.getContainerRuntime();
    const dump = `${shellQuote(runtime)} exec ${shellQuote(mysqlContainer)} mysqldump -h${shellQuote(localIpv4Host)} -u${shellQuote(mysqlRootUser)} -p${shellQuote(mysqlRootPassword)} --single-transaction --quick --routines --triggers --events ${shellQuote(database)}`;
    const gzip = options.gzip ? ' | gzip -c' : '';
    const gpg = options.encrypt ? ` | gpg --batch --yes --trust-model always --encrypt --recipient ${shellQuote(options.recipient ?? '')}` : '';
    await runCommand('sh', ['-c', `${dump}${gzip}${gpg} > ${shellQuote(options.output)}`], { verbose: options.verbose });
}

export async function importDatabase(inputFile: string, database: string, options: { force: boolean; verbose?: boolean }): Promise<void> {
    await fs.access(inputFile);
    await ensureTargetDatabaseAvailable(database, options);

    const runtime = await docker.getContainerRuntime();
    const source = inputFile.endsWith('.gpg') || inputFile.includes('.gpg.') || inputFile.endsWith('.enc') || inputFile.includes('.enc.')
        ? `gpg --batch --decrypt ${shellQuote(inputFile)}`
        : `cat ${shellQuote(inputFile)}`;
    const unzip = inputFile.endsWith('.gz') || inputFile.includes('.gz.') ? ' | gzip -dc' : '';
    const mysql = `${shellQuote(runtime)} exec -i ${shellQuote(mysqlContainer)} mysql -h${shellQuote(localIpv4Host)} -u${shellQuote(mysqlRootUser)} -p${shellQuote(mysqlRootPassword)} ${shellQuote(database)}`;
    await runCommand('sh', ['-c', `${source}${unzip} | ${mysql}`], { verbose: options.verbose });
}

function runMysqlStatement(statement: string): Promise<void> {
    return docker.run(['exec', mysqlContainer, 'mysql', `-h${localIpv4Host}`, `-u${mysqlRootUser}`, `-p${mysqlRootPassword}`, '-e', statement]);
}

function runMysqlStatementCapture(statement: string) {
    return docker.run(['exec', mysqlContainer, 'mysql', `-h${localIpv4Host}`, `-u${mysqlRootUser}`, `-p${mysqlRootPassword}`, '-N', '-B', '-e', statement], { capture: true });
}

async function listBaseTables(database: string): Promise<string[]> {
    const result = await runMysqlStatementCapture(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ${sqlString(database)} AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME;`);
    return result.stdout.split('\n').map(table => table.trim()).filter(Boolean);
}

async function hasNonTableObjects(database: string): Promise<boolean> {
    const result = await runMysqlStatementCapture(`SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ${sqlString(database)} AND TABLE_TYPE <> 'BASE TABLE' UNION ALL SELECT COUNT(*) FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA = ${sqlString(database)} UNION ALL SELECT COUNT(*) FROM INFORMATION_SCHEMA.EVENTS WHERE EVENT_SCHEMA = ${sqlString(database)};`);
    return result.stdout.split('\n').some(value => Number(value.trim()) > 0);
}

async function listInsertableColumns(database: string, table: string): Promise<string[]> {
    const result = await runMysqlStatementCapture(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ${sqlString(database)} AND TABLE_NAME = ${sqlString(table)} AND EXTRA NOT LIKE '%GENERATED%' ORDER BY ORDINAL_POSITION;`);
    return result.stdout.split('\n').map(column => column.trim()).filter(Boolean);
}

async function assertOutputDoesNotExist(file: string): Promise<void> {
    try {
        await fs.access(file);
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return;
        }
        throw error;
    }
    throw new Error(`Output file ${file} already exists. Pass --force to overwrite it.`);
}

function escapeIdentifier(identifier: string): string {
    return `\`${identifier.replaceAll('`', '``')}\``;
}

function sqlString(value: string): string {
    return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", `'"'"'`)}'`;
}
