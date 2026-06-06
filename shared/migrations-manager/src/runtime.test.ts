import { describe, expect, it } from 'vitest';
import { parseRuntimeJson, runPipeline } from './runtime.js';

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

describe('runtime JSON parsing', () => {
    it('reports empty runtime JSON output with command context', () => {
        expect(() => parseRuntimeJson('', { command: 'podman', args: ['image', 'inspect', 'image:tag'], stderr: 'missing output' })).toThrow('podman image inspect image:tag');
        expect(() => parseRuntimeJson('', { command: 'podman', args: ['image', 'inspect', 'image:tag'], stderr: 'missing output' })).toThrow('empty stdout');
    });

    it('reports malformed runtime JSON output with command context', () => {
        expect(() => parseRuntimeJson('{', { command: 'podman', args: ['image', 'inspect', 'image:tag'] })).toThrow('Could not parse JSON output from podman image inspect image:tag');
    });
});
