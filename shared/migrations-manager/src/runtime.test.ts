import { describe, expect, it } from 'vitest';
import { runPipeline } from './runtime.js';

describe('runtime pipeline', () => {
    it('fails when an earlier pipeline stage fails even if the last stage exits successfully', async () => {
        await expect(runPipeline([
            { command: process.execPath, args: ['-e', 'process.stderr.write("decrypt failed"); process.exit(2);'] },
            { command: process.execPath, args: ['-e', 'process.stdin.resume(); process.stdin.on("end", () => process.exit(0));'] },
        ])).rejects.toThrow('decrypt failed');
    });

    it('streams successful pipeline stages', async () => {
        await expect(runPipeline([
            { command: process.execPath, args: ['-e', 'process.stdout.write("SELECT 1;");'] },
            { command: process.execPath, args: ['-e', 'process.stdin.resume(); process.stdin.on("end", () => process.exit(0));'] },
        ])).resolves.toBeUndefined();
    });
});
