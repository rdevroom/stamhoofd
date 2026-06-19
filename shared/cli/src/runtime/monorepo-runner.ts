import fs from 'node:fs/promises';
import path from 'node:path';
import { caddyRootCaPath, localIpv4Host, localhostPortMappingDynamic, mysqlInternalPort, mysqlRootPassword } from '../config/shared-service-config.js';
import type { CliContext } from '../context/create-context.js';
import { buildBackendEnv } from '../config/build-config.js';
import { CaddyService } from '../services/definitions/caddy-service.js';
import * as docker from '../services/docker.js';
import { startSharedServices } from '../services/shared-services.js';
import { run } from './command-runner.js';
import { ensurePreparedTestMysqlImage, getExpectedPlaywrightWorkerCount, getMappedMysqlPort, preparePlaywrightDatabases, testMysqlDataDir } from './test-mysql-image.js';

const globalSharedPackages = [
    'shared/types',
    'shared/test-utils',
    'shared/utility',
    'shared/cli',
    'shared/excel-writer',
    'shared/structures',
    'shared/object-differ',
    'shared/locales',
];

const backendSharedPackages = [
    'backend/shared/queues',
    'backend/shared/env',
    'backend/shared/i18n',
    'backend/shared/sql',
    'backend/shared/email',
    'backend/shared/models',
    'backend/shared/logging',
    'backend/shared/crons',
    'backend/shared/middleware',
];

const testMysqlContainer = 'stamhoofd-test-mysql';
const e2eMysqlContainer = 'stamhoofd-e2e-mysql';
const sharedBuildReadyFile = `.development/cli/generated/shared-build-${process.pid}.ready`;

export async function buildShared(context: CliContext): Promise<void> {
    console.log('\x1B[35m[BUILD]\x1B[0m Building globally shared dependencies...');
    for (const packagePath of globalSharedPackages) {
        await run('yarn', ['--cwd', packagePath, '-s', 'build'], { cwd: context.rootDir, verbose: context.verbose });
    }
    console.log('\x1B[35m[BUILD]\x1B[0m Building shared backend dependencies...');
    for (const packagePath of backendSharedPackages) {
        await run('yarn', ['--cwd', packagePath, '-s', 'build'], { cwd: context.rootDir, verbose: context.verbose });
    }
    console.log('\x1B[35m[BUILD]\x1B[0m Done building shared dependencies.');
}

export async function buildAll(context: CliContext): Promise<void> {
    await buildShared(context);
    await run('yarn', ['-s', 'lerna', 'run', 'dev:build'], { cwd: context.rootDir, env: { NX_DAEMON: 'false', STAMHOOFD_ENV: context.env }, verbose: context.verbose });
}

export async function lint(context: CliContext): Promise<void> {
    await run('yarn', ['-s', 'lerna', 'run', 'lint', '--', '--', '--quiet'], { cwd: context.rootDir, env: { NX_DAEMON: 'false' }, verbose: context.verbose });
}

export async function typecheck(context: CliContext): Promise<void> {
    await run('yarn', ['-s', 'lerna', 'run', 'typecheck'], { cwd: context.rootDir, env: { NX_DAEMON: 'false' }, verbose: context.verbose });
}

export async function migrate(context: CliContext): Promise<void> {
    await buildShared(context);
    await run('yarn', ['-s', 'lerna', 'run', 'migrations', '--concurrency', '1'], { cwd: context.rootDir, env: { ...buildBackendEnv(context) }, verbose: context.verbose });
}

export type TestUnitOptions = {
    ci: boolean;
    clear: boolean;
    scopes?: string[];
    vitestArgs?: string[];
};

export async function testUnit(context: CliContext, options: TestUnitOptions): Promise<void> {
    const dbPort = await startTestMysql(context, options.clear);
    try {
        await run('npx', [
            'lerna',
            'run',
            'test',
            '--ignore',
            '@stamhoofd/playwright',
            '--ignore',
            '@stamhoofd/dashboard',
            ...(options.scopes ?? []).flatMap(scope => ['--scope', scope]),
            ...((options.vitestArgs?.length ?? 0) > 0 ? ['--', ...(options.vitestArgs ?? [])] : []),
        ], { cwd: context.rootDir, env: { NX_DAEMON: 'false', CI: options.ci ? 'true' : undefined, DB_PORT: dbPort }, verbose: context.verbose });
    }
    finally {
        await docker.removeContainer(testMysqlContainer, context.verbose);
    }
}

export async function testE2e(context: CliContext, options: { ci: boolean; clear: boolean; extra?: boolean; ui: boolean; workers?: number }): Promise<void> {
    const workerCount = getExpectedPlaywrightWorkerCount(options);
    const dbPort = await startE2eMysql(context, { clear: options.clear, workerCount });
    let shouldRestoreCaddy = false;
    await buildShared(context);
    try {
        await startSharedServices(context);
        shouldRestoreCaddy = true;
        await run('yarn', ['--cwd', 'backend/app/api', '-s', 'build:playwright:pre'], { cwd: context.rootDir, env: { DB_PORT: dbPort }, verbose: context.verbose });
        await run('yarn', ['--cwd', 'tests/playwright', '-s', 'test', ...(options.ui ? ['--ui'] : []), ...(options.workers === undefined ? [] : ['--workers', String(options.workers)])], { cwd: context.rootDir, env: { NX_DAEMON: 'false', CI: options.ci ? 'true' : undefined, DB_PORT: dbPort, NODE_EXTRA_CA_CERTS: caddyRootCaPath(), PLAYWRIGHT_INCLUDE_EXTRA: options.extra ? '1' : undefined, PLAYWRIGHT_WORKER_COUNT: String(workerCount), STAMHOOFD_SKIP_PLAYWRIGHT_MIGRATIONS: 'true' }, verbose: context.verbose });
    }
    finally {
        if (shouldRestoreCaddy) {
            try {
                await CaddyService.reload(context);
            }
            catch (error) {
                console.warn(`Failed to restore shared Caddy config: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
}

export async function cleanBuild(context: CliContext, options: { dryRun?: boolean } = {}): Promise<void> {
    const roots = [
        'tests',
        'shared',
        'frontend/app',
        'backend/shared',
        'backend/app',
    ];

    if (options.dryRun) {
        console.log('Would remove dist, dist-playwright, and *.tsbuildinfo from:');
        roots.forEach(root => console.log(`  ${root}/*`));
        return;
    }

    for (const root of roots) {
        await cleanPackageChildren(path.join(context.rootDir, root));
    }
}

export function sharedBuildWatchCommand(): string {
    const command = [...globalSharedPackages, ...backendSharedPackages]
        .map(packagePath => `yarn --cwd ${packagePath} -s build`)
        .join(' && ');
    return `mkdir -p .development/cli/generated && rm -f ${sharedBuildReadyFile} && yarn -s nodemon --quiet --signal SIGTERM --watch shared --watch backend/shared --ignore './shared/*/dist/' --ignore './backend/shared/*/dist/' --ext .ts,.json,.sql,.mjs --exec '${command} && touch ${sharedBuildReadyFile} || exit 0'`;
}

export function sharedBuildReadyCommand(): string {
    return `wait-on ${sharedBuildReadyFile} shared/cli/dist/index.js shared/locales/dist/index.d.ts`;
}

async function cleanPackageChildren(root: string): Promise<void> {
    let entries: string[];
    try {
        entries = await fs.readdir(root);
    }
    catch {
        return;
    }

    await Promise.all(entries.map(async (entry) => {
        const packagePath = path.join(root, entry);
        const stat = await fs.stat(packagePath).catch(() => undefined);
        if (!stat?.isDirectory()) {
            return;
        }
        await fs.rm(path.join(packagePath, 'dist'), { recursive: true, force: true });
        await fs.rm(path.join(packagePath, 'dist-playwright'), { recursive: true, force: true });
        await removeTsBuildInfo(packagePath);
    }));
}

async function removeTsBuildInfo(packagePath: string): Promise<void> {
    const entries = await fs.readdir(packagePath).catch(() => []);
    await Promise.all(entries
        .filter(entry => entry.endsWith('.tsbuildinfo'))
        .map(entry => fs.rm(path.join(packagePath, entry), { force: true })));
}

async function startTestMysql(context: CliContext, clear: boolean): Promise<string> {
    console.log('Starting isolated test MySQL...');
    const image = await ensurePreparedTestMysqlImage(context, { clear });
    await docker.removeContainer(testMysqlContainer, context.verbose);
    await docker.run(['run', '-d', '--name', testMysqlContainer, '-e', `MYSQL_ROOT_PASSWORD=${mysqlRootPassword}`, '-p', localhostPortMappingDynamic(mysqlInternalPort), image, `--datadir=${testMysqlDataDir}`], { quiet: true, verbose: context.verbose });
    await docker.waitForMysql(testMysqlContainer);
    const dbPort = await getMappedMysqlPort(testMysqlContainer, context.verbose);
    console.log(`Test MySQL is mapped to ${localIpv4Host}:${dbPort}.`);
    return dbPort;
}

async function startE2eMysql(context: CliContext, options: { clear: boolean; workerCount: number }): Promise<string> {
    console.log('Starting isolated e2e MySQL...');
    const image = await ensurePreparedTestMysqlImage(context, { clear: options.clear });
    await docker.removeContainer(e2eMysqlContainer, context.verbose);
    await docker.run(['run', '-d', '--name', e2eMysqlContainer, '-e', `MYSQL_ROOT_PASSWORD=${mysqlRootPassword}`, '-p', localhostPortMappingDynamic(mysqlInternalPort), image, `--datadir=${testMysqlDataDir}`], { quiet: true, verbose: context.verbose });

    await docker.waitForMysql(e2eMysqlContainer);
    await preparePlaywrightDatabases(e2eMysqlContainer, options.workerCount, context.verbose);
    const dbPort = await getMappedMysqlPort(e2eMysqlContainer, context.verbose);
    console.log(`E2E MySQL is mapped to ${localIpv4Host}:${dbPort}.`);
    return dbPort;
}
