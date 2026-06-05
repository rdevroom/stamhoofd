import type { MigrationProgressEvent } from '@stamhoofd/migrations-manager';
import chalk from 'chalk';
import { createLiveOutput, type LiveOutput, StatusItemKind } from '../runtime/live-output.js';
import { formatMigrationLabel } from './format.js';

export type MigrationProgressOutput = {
    output: LiveOutput;
    onProgress(event: MigrationProgressEvent): void;
    stop(): void;
};

export function createMigrationProgressOutput(): MigrationProgressOutput {
    const output = createLiveOutput();
    let completed = 0;
    let total = 0;
    let current = 'Preparing migrations';

    const render = () => {
        output.setStatus([
            { label: `${progressBar(completed, total)} ${completed}/${total}` },
            { label: current, kind: StatusItemKind.Muted },
        ]);
    };

    return {
        output,
        onProgress(event) {
            if (event.type === 'start') {
                completed = 0;
                total = event.total;
                current = total === 0 ? 'No migrations to apply' : 'Starting migrations';
                render();
                return;
            }
            if (event.type === 'migration:start') {
                completed = event.completed;
                total = event.total;
                current = formatMigrationLabel(event.migration.normalizedFile).replace('\n', ' ');
                render();
                return;
            }
            if (event.type === 'migration:finish') {
                completed = event.completed;
                total = event.total;
                current = formatMigrationLabel(event.result.migration.normalizedFile).replace('\n', ' ');
                output.log(`${event.result.status.toUpperCase()} ${current} -> ${event.result.image}`);
                render();
                return;
            }
            completed = event.completed;
            total = event.total;
            current = event.completed === event.total ? 'Finished migrations' : current;
            render();
        },
        stop() {
            output.stop();
        },
    };
}

function progressBar(completed: number, total: number): string {
    const width = 24;
    const ratio = total === 0 ? 1 : Math.max(0, Math.min(1, completed / total));
    const filled = Math.round(width * ratio);
    return `[${chalk.green('='.repeat(filled))}${chalk.dim('-'.repeat(width - filled))}]`;
}
