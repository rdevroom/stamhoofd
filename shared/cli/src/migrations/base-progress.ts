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
            output.log(`Created base image ${event.image} (${event.imageId})`);
        },
        stop() {
            output.stop();
        },
    };
}
