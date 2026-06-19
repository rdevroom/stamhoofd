import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { localIpv4Host, localhostPortMappingDynamic, mysqlImage, mysqlInternalPort, mysqlRootPassword, mysqlRootUser, mysqlServerArgs } from '../config/shared-service-config.js';
import { buildBackendEnv } from '../config/build-config.js';
import type { CliContext } from '../context/create-context.js';
import * as docker from '../services/docker.js';
import { run } from './command-runner.js';

const preparedImagePrefix = 'stamhoofd-test-mysql-prepared';
const prepareContainer = 'stamhoofd-test-mysql-prepare';
const migrationsHashLabel = 'stamhoofd.test-mysql.migrations-hash';
const preparedLabel = 'stamhoofd.test-mysql.prepared';
const createdAtLabel = 'stamhoofd.test-mysql.created-at';
export const baseTestDatabase = 'stamhoofd-tests';
export const testMysqlDataDir = '/stamhoofd-mysql-data';

const migrationDirectories = [
    'backend/shared/models/src/migrations',
    'backend/shared/email/migrations',
    'backend/app/api/src/migrations',
];

export async function ensurePreparedTestMysqlImage(context: CliContext, options: { clear: boolean }): Promise<string> {
    const migrationsHash = await getMigrationsHash(context.rootDir);
    const image = getPreparedTestMysqlImage(migrationsHash);

    if (options.clear) {
        await docker.removeImage(image, context.verbose);
    }

    if (await isPreparedImageCurrent(image, migrationsHash)) {
        console.log(`Using prepared test MySQL image ${image}.`);
        return image;
    }

    console.log(`Preparing test MySQL image ${image}...`);
    await docker.removeContainer(prepareContainer, context.verbose);
    await docker.run(['run', '-d', '--name', prepareContainer, '-e', `MYSQL_ROOT_PASSWORD=${mysqlRootPassword}`, '-p', localhostPortMappingDynamic(mysqlInternalPort), mysqlImage, `--datadir=${testMysqlDataDir}`, ...mysqlServerArgs()], { quiet: true, verbose: context.verbose });

    try {
        await docker.waitForMysql(prepareContainer);
        await createDatabase(prepareContainer, baseTestDatabase, context.verbose);
        const dbPort = await getMappedMysqlPort(prepareContainer, context.verbose);
        await runTestMigrations(context, dbPort);
        await docker.run(['exec', prepareContainer, 'mysqladmin', `-h${localIpv4Host}`, `-u${mysqlRootUser}`, `-p${mysqlRootPassword}`, 'shutdown'], { quiet: true, allowFailure: true, verbose: context.verbose });
        await docker.commitContainer(prepareContainer, image, {
            [preparedLabel]: 'true',
            [migrationsHashLabel]: migrationsHash,
            [createdAtLabel]: new Date().toISOString(),
        }, context.verbose);
    }
    finally {
        await docker.removeContainer(prepareContainer, context.verbose);
    }

    console.log(`Prepared test MySQL image ${image}.`);
    return image;
}

async function runTestMigrations(context: CliContext, dbPort: string): Promise<void> {
    await run('yarn', ['--cwd', 'backend/app/api', '-s', 'build:full'], { cwd: context.rootDir, env: { ...buildBackendEnv(context) }, verbose: context.verbose });
    const script = path.join(context.generatedDir, 'run-test-migrations.mjs');
    await fs.mkdir(context.generatedDir, { recursive: true });
    await fs.writeFile(script, `import { TestUtils } from '@stamhoofd/test-utils';\nprocess.env.TZ = 'UTC';\nTestUtils.globalSetup();\nTestUtils.setEnvironment('DB_PORT', Number(process.env.DB_PORT));\nTestUtils.setEnvironment('DB_DATABASE', process.env.DB_DATABASE);\nconst { run } = await import('${pathToFileURL(path.join(context.rootDir, 'backend/app/api/dist/src/migrate.js')).href}');\nawait run();\n`);
    await run('node', [script], { cwd: context.rootDir, env: { ...buildBackendEnv(context), NODE_ENV: 'test', DB_PORT: dbPort, DB_DATABASE: baseTestDatabase }, verbose: context.verbose });
}

export async function getMappedMysqlPort(container: string, verbose: boolean): Promise<string> {
    const port = await docker.run(['port', container, '3306/tcp'], { capture: true, verbose });
    const dbPort = port.stdout.trim().split(':').at(-1);
    if (!dbPort) {
        throw new Error(`Could not determine MySQL port for ${container}.`);
    }
    return dbPort;
}

export async function createDatabase(container: string, database: string, verbose: boolean): Promise<void> {
    await docker.run(['exec', container, 'mysql', `-h${localIpv4Host}`, `-u${mysqlRootUser}`, `-p${mysqlRootPassword}`, '-e', `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`], { quiet: true, verbose });
}

export async function preparePlaywrightDatabases(container: string, workerCount: number, verbose: boolean): Promise<void> {
    for (let workerId = 0; workerId < workerCount; workerId += 1) {
        const database = `stamhoofd-playwright-${workerId}`;
        await docker.run(['exec', container, 'mysql', `-h${localIpv4Host}`, `-u${mysqlRootUser}`, `-p${mysqlRootPassword}`, '-e', `DROP DATABASE IF EXISTS \`${database}\`; CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`], { quiet: true, verbose });
        await docker.run(['exec', container, 'sh', '-c', `mysqldump -h${localIpv4Host} -u${mysqlRootUser} -p${mysqlRootPassword} ${quoteShell(baseTestDatabase)} | mysql -h${localIpv4Host} -u${mysqlRootUser} -p${mysqlRootPassword} ${quoteShell(database)}`], { quiet: true, verbose });
    }
}

export function getExpectedPlaywrightWorkerCount(options: { ci: boolean; workers?: number }): number {
    if (options.workers !== undefined) {
        return options.workers;
    }
    if (options.ci) {
        return 2;
    }
    return Math.max(1, Math.floor(os.availableParallelism() / 2));
}

async function isPreparedImageCurrent(image: string, migrationsHash: string): Promise<boolean> {
    if (!await docker.imageExists(image)) {
        return false;
    }
    return await docker.imageLabel(image, migrationsHashLabel) === migrationsHash
        && await docker.imageLabel(image, preparedLabel) === 'true';
}

function getPreparedTestMysqlImage(migrationsHash: string): string {
    return `${preparedImagePrefix}:${migrationsHash}`;
}

export async function getMigrationsHashForTests(rootDir: string): Promise<string> {
    return await getMigrationsHash(rootDir);
}

async function getMigrationsHash(rootDir: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const files = (await Promise.all(migrationDirectories.map(async (directory) => {
        const absoluteDirectory = path.join(rootDir, directory);
        return (await listMigrationFiles(absoluteDirectory)).map(file => ({
            absolutePath: file,
            relativePath: path.relative(rootDir, file),
        }));
    }))).flat().sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    for (const file of files) {
        hash.update(file.relativePath);
        hash.update('\0');
        hash.update(await fs.readFile(file.absolutePath));
        hash.update('\0');
    }

    return hash.digest('hex').slice(0, 16);
}

async function listMigrationFiles(directory: string): Promise<string[]> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return await listMigrationFiles(filePath);
        }
        if (entry.isFile()) {
            return [filePath];
        }
        return [];
    }));
    return files.flat();
}

function quoteShell(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
}
