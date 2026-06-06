import type { BaseImageProgressEvent } from '@stamhoofd/migrations-manager';
import { createLiveOutput, type LiveOutput, StatusItemKind } from '../runtime/live-output.js';

export type BaseProgressOutput = {
    output: LiveOutput;
    onProgress(event: BaseImageProgressEvent): void;
    stop(): void;
};

const frames = ['-', '\\', '|', '/'];

export function createBaseProgressOutput(): BaseProgressOutput {
    const output = createLiveOutput();
    let current = 'Preparing base image';

    return {
        output,
        onProgress(event) {
            if (event.type === 'phase:start') {
                current = event.message;
                output.setLiveStatus(frame => [{ label: `${frames[frame % frames.length]} ${current}`, kind: StatusItemKind.Muted }]);
                return;
            }
            if (event.type === 'phase:finish') {
                output.clearStatus();
                output.log(`DONE ${event.message}`);
                return;
            }
            if (event.type === 'import:progress') {
                output.setLiveStatus(frame => [{ label: formatImportProgress(current, event, frame), kind: StatusItemKind.Muted }], { intervalMs: 250 });
                return;
            }
            output.log(`Created base image ${event.image} (${event.imageId})`);
        },
        stop() {
            output.stop();
        },
    };
}

function formatImportProgress(current: string, progress: BaseImageProgressEvent & { type: 'import:progress' }, frame: number): string {
    const parts = [`${frames[frame % frames.length]} ${current}`];
    if (progress.receivedBytes !== undefined && progress.totalBytes !== undefined && progress.totalBytes > 0) {
        const percentage = Math.max(0, Math.min(99, Math.floor((progress.receivedBytes / progress.totalBytes) * 100)));
        parts.push(`${percentage}%`, `${formatBytes(Math.min(progress.receivedBytes, progress.totalBytes))} / ${formatBytes(progress.totalBytes)}`);
    } else if (progress.receivedBytes !== undefined) {
        parts.push(`${formatBytes(progress.receivedBytes)} received`);
    }

    if (progress.totalTables !== undefined && progress.createdTables !== undefined) {
        parts.push(`${progress.createdTables}/${progress.totalTables} tables`);
    } else if (progress.createdTables !== undefined) {
        parts.push(`${progress.createdTables} tables`);
    } else if (progress.metadataStatus === 'scanning') {
        parts.push('scanning dump');
    }

    if (progress.metadataStatus === 'failed') {
        parts.push('table total unavailable');
    }

    return parts.join('  ');
}

function formatBytes(bytes: number): string {
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
