import fs from 'node:fs/promises';
import path from 'node:path';
import { runCommand } from './runtime.js';
import type { BuildMode } from './types.js';

const packages = [
    'shared/types',
    'shared/test-utils',
    'shared/utility',
    'shared/migrations-manager',
    'shared/excel-writer',
    'shared/structures',
    'shared/object-differ',
    'shared/locales',
    'backend/shared/queues',
    'backend/shared/env',
    'backend/shared/i18n',
    'backend/shared/sql',
    'backend/shared/email',
    'backend/shared/models',
    'backend/shared/logging',
    'backend/shared/crons',
    'backend/shared/middleware',
    'backend/app/api',
];

export async function buildRequiredPackages(rootDir: string, mode: BuildMode, verbose = false): Promise<void> {
    if (mode === 'skip') {
        return;
    }
    if (mode === 'auto' && await outputsExist(rootDir)) {
        return;
    }
    for (const packagePath of packages) {
        await runCommand('yarn', ['--cwd', packagePath, '-s', 'build'], { cwd: rootDir, verbose });
    }
}

async function outputsExist(rootDir: string): Promise<boolean> {
    const required = [
        'shared/migrations-manager/dist/index.js',
        'backend/app/api/dist/single-migration.js',
    ];
    for (const file of required) {
        try {
            await fs.access(path.join(rootDir, file));
        } catch {
            return false;
        }
    }
    return true;
}
