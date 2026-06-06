import type { MigrationProgressEvent } from '@stamhoofd/migrations-manager';
import chalk from 'chalk';
import { stripVTControlCharacters } from 'node:util';
import { createLiveOutput, type LiveOutput } from '../runtime/live-output.js';
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
    let currentPhase: string | undefined;
    let phaseStates = new Map<string, 'pending' | 'running' | 'done'>();

    const render = () => {
        const lines = [`${progressBar(completed, total, current)} ${completed}/${total}  ${current}`];
        const phases = formatPhaseStates(phaseStates, currentPhase);
        if (phases) {
            lines.push(phases);
        }
        output.setStatus([{ label: lines.join('\n') }]);
    };

    return {
        output,
        onProgress(event) {
            if (event.type === 'start') {
                completed = 0;
                total = event.total;
                current = total === 0 ? 'No migrations to apply' : 'Starting migrations';
                currentPhase = undefined;
                phaseStates = new Map();
                render();
                return;
            }
            if (event.type === 'migration:start') {
                completed = event.completed;
                total = event.total;
                current = formatMigrationLabel(event.migration.normalizedFile).replace('\n', ' ');
                currentPhase = undefined;
                phaseStates = initialPhaseStates();
                render();
                return;
            }
            if (event.type === 'phase:start') {
                completed = event.completed;
                total = event.total;
                currentPhase = event.phase;
                phaseStates.set(event.phase, 'running');
                render();
                return;
            }
            if (event.type === 'phase:finish') {
                completed = event.completed;
                total = event.total;
                currentPhase = undefined;
                phaseStates.set(event.phase, 'done');
                render();
                return;
            }
            if (event.type === 'migration:finish') {
                completed = event.completed;
                total = event.total;
                current = formatMigrationLabel(event.result.migration.normalizedFile).replace('\n', ' ');
                currentPhase = undefined;
                phaseStates = new Map();
                output.log(`${event.result.status.toUpperCase()} ${current} -> ${event.result.image}`);
                render();
                return;
            }
            completed = event.completed;
            total = event.total;
            current = event.completed === event.total ? 'Finished migrations' : current;
            currentPhase = undefined;
            phaseStates = new Map();
            render();
        },
        stop() {
            output.stop();
        },
    };
}

const phaseLabels = new Map([
    ['assert-image-missing', 'check image'],
    ['start-container', 'start mysql'],
    ['resolve-mapped-port', 'resolve port'],
    ['run-migration', 'run migration'],
    ['prepare-metadata', 'prepare metadata'],
    ['write-manifest', 'write manifest'],
    ['stop-mysql', 'stop mysql'],
    ['commit-image', 'commit image'],
    ['remove-container', 'cleanup'],
]);

function initialPhaseStates(): Map<string, 'pending' | 'running' | 'done'> {
    return new Map([...phaseLabels.keys()].map(phase => [phase, 'pending']));
}

function formatPhaseStates(states: Map<string, 'pending' | 'running' | 'done'>, currentPhase: string | undefined): string {
    if (states.size === 0) {
        return '';
    }
    return [...phaseLabels.entries()].map(([phase, label]) => {
        const state = states.get(phase) ?? 'pending';
        if (state === 'done') {
            return chalk.green(`[x] ${label}`);
        }
        if (state === 'running' || phase === currentPhase) {
            return chalk.cyan(`[>] ${label}`);
        }
        return chalk.dim(`[ ] ${label}`);
    }).join('  ');
}

function progressBar(completed: number, total: number, current: string): string {
    const terminalWidth = process.stdout.columns ?? 80;
    const reserved = stripVTControlCharacters(` ${completed}/${total}  ${current}`).length;
    const width = Math.max(24, terminalWidth - reserved - 4);
    const ratio = total === 0 ? 1 : Math.max(0, Math.min(1, completed / total));
    const filled = Math.round(width * ratio);
    return `[${chalk.green('='.repeat(filled))}${chalk.dim('-'.repeat(width - filled))}]`;
}
