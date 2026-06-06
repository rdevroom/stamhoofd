import { run } from './command-runner.js';

export type RequirementCheckResult = {
    ok: boolean;
    details: string;
    manualFix?: string;
};

export async function checkGzipSupport(): Promise<RequirementCheckResult> {
    const result = await run('gzip', ['--version'], { capture: true, allowFailure: true });
    if (result.status !== 0) {
        return { ok: false, details: 'gzip not found', manualFix: 'Install gzip to use compressed database exports' };
    }

    return { ok: true, details: result.stdout.split('\n')[0]?.trim() || 'gzip available' };
}
