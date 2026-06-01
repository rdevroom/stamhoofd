import path from 'node:path';
import { run } from '../runtime/command-runner.js';

export function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export async function resolveWorkspaceName(rootDir: string): Promise<string> {
    return slug(process.env.STAMHOOFD_WORKSPACE_NAME ?? path.basename(rootDir)) || 'workspace';
}

export async function resolveGitBranch(rootDir: string): Promise<string | null> {
    if (process.env.STAMHOOFD_BRANCH) {
        return process.env.STAMHOOFD_BRANCH;
    }

    const result = await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: rootDir, capture: true, allowFailure: true });
    const branch = result.stdout.trim();
    return branch && branch !== 'HEAD' ? branch : null;
}

export async function resolvePrimaryInstance(rootDir: string, branch: string | null): Promise<boolean> {
    if (process.env.STAMHOOFD_PRIMARY_INSTANCE) {
        return process.env.STAMHOOFD_PRIMARY_INSTANCE === '1';
    }

    const jjRoot = await run('jj', ['root'], { cwd: rootDir, capture: true, allowFailure: true });
    if (jjRoot.status === 0) {
        return false;
    }

    const dir = path.basename(rootDir);
    return (branch === 'main' || branch === 'develop') && (dir === 'main' || dir === 'develop');
}
