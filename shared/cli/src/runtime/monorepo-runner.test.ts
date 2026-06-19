import { beforeEach, describe, expect, it, vi } from 'vitest';
import { caddyRootCaPath } from '../config/shared-service-config.js';
import { CaddyService } from '../services/definitions/caddy-service.js';
import * as docker from '../services/docker.js';
import { startSharedServices } from '../services/shared-services.js';
import { run } from './command-runner.js';
import { testE2e, testUnit } from './monorepo-runner.js';

vi.mock('./command-runner.js', () => ({
    run: vi.fn(async () => undefined),
}));

vi.mock('../services/docker.js', () => ({
    containerIsRunning: vi.fn(async () => true),
    removeContainer: vi.fn(async () => undefined),
    waitForMysql: vi.fn(async () => undefined),
    run: vi.fn(async (args: string[]) => {
        if (args[0] === 'port') {
            return { stdout: '127.0.0.1:55103\n', stderr: '', status: 0 };
        }
        return { stdout: '', stderr: '', status: 0 };
    }),
}));

vi.mock('../services/shared-services.js', () => ({
    startSharedServices: vi.fn(async () => undefined),
}));

vi.mock('../services/definitions/caddy-service.js', () => ({
    CaddyService: {
        reload: vi.fn(async () => undefined),
    },
}));

describe('monorepo runner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('runs unit tests with an isolated MySQL database', async () => {
        await testUnit(context(), { ci: false });

        expect(docker.removeContainer).toHaveBeenCalledWith('stamhoofd-test-mysql', false);
        expect(docker.run).toHaveBeenCalledWith(expect.arrayContaining(['run', '-d', '--name', 'stamhoofd-test-mysql']), { quiet: true, verbose: false });
        expect(docker.waitForMysql).toHaveBeenCalledWith('stamhoofd-test-mysql');

        expect(run).toHaveBeenCalledWith('npx', [
            'lerna',
            'run',
            'test',
            '--ignore',
            '@stamhoofd/playwright',
            '--ignore',
            '@stamhoofd/dashboard',
        ], { cwd: '/repo', env: { NX_DAEMON: 'false', CI: undefined, DB_PORT: '55103' }, verbose: false });
    });

    it('forwards unit test scopes and Vitest args', async () => {
        await testUnit(context(), {
            ci: true,
            scopes: ['@stamhoofd/backend'],
            vitestArgs: [
                'src/endpoints/organization/dashboard/registration-periods/PatchOrganizationRegistrationPeriodsEndpoint.test.ts',
                '-t',
                'should reject creating a waiting list after a nested in the parent group creation',
            ],
        });

        expect(run).toHaveBeenCalledWith('npx', [
            'lerna',
            'run',
            'test',
            '--ignore',
            '@stamhoofd/playwright',
            '--ignore',
            '@stamhoofd/dashboard',
            '--scope',
            '@stamhoofd/backend',
            '--',
            'src/endpoints/organization/dashboard/registration-periods/PatchOrganizationRegistrationPeriodsEndpoint.test.ts',
            '-t',
            'should reject creating a waiting list after a nested in the parent group creation',
        ], { cwd: '/repo', env: { NX_DAEMON: 'false', CI: 'true', DB_PORT: '55103' }, verbose: false });
    });

    it('passes the Caddy root CA to Playwright', async () => {
        await testE2e(context(), { ci: false, clear: false, ui: false, workers: 2 });

        expect(docker.containerIsRunning).toHaveBeenCalledWith('stamhoofd-e2e-mysql');
        expect(startSharedServices).toHaveBeenCalledWith(context());
        expect(CaddyService.reload).toHaveBeenCalledWith(context());

        const playwrightRun = vi.mocked(run).mock.calls.find(([command, args]) => command === 'yarn' && args.includes('tests/playwright'));
        expect(playwrightRun).toBeDefined();
        expect(playwrightRun?.[2].env).toMatchObject({
            DB_PORT: '55103',
            NODE_EXTRA_CA_CERTS: caddyRootCaPath(),
        });
    });
});

function context() {
    return {
        rootDir: '/repo',
        generatedDir: '/repo/.development/cli/generated',
        env: 'stamhoofd',
        workspace: 'main',
        verbose: false,
        instance: {
            name: 'main',
            prefix: '',
            primary: true,
            portOffset: 0,
        },
    };
}
