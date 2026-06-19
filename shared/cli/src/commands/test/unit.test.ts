import { describe, expect, it } from 'vitest';
import { buildVitestArgs, splitCommandArgs } from './unit.js';

describe('TestUnit command', () => {
    it('builds Vitest args from files and test name', () => {
        expect(buildVitestArgs(['src/foo.test.ts'], 'rejects invalid input')).toEqual([
            'src/foo.test.ts',
            '-t',
            'rejects invalid input',
        ]);
    });

    it('appends args after -- unchanged', () => {
        expect(buildVitestArgs(['src/foo.test.ts'], undefined, ['--reporter', 'hanging-process', '--runInBand'])).toEqual([
            'src/foo.test.ts',
            '--reporter',
            'hanging-process',
            '--runInBand',
        ]);
    });

    it('keeps test name before passthrough args', () => {
        expect(buildVitestArgs(['src/foo.test.ts'], 'rejects invalid input', ['--reporter', 'hanging-process'])).toEqual([
            'src/foo.test.ts',
            '-t',
            'rejects invalid input',
            '--reporter',
            'hanging-process',
        ]);
    });

    it('splits passthrough args after --', () => {
        expect(splitCommandArgs([
            '--scope',
            '@stamhoofd/backend',
            'src/foo.test.ts',
            '-t',
            'rejects invalid input',
            '--',
            '--reporter',
            'hanging-process',
        ])).toEqual({
            commandArgs: ['--scope', '@stamhoofd/backend', 'src/foo.test.ts', '-t', 'rejects invalid input'],
            passthroughArgs: ['--reporter', 'hanging-process'],
        });
    });

    it('splits passthrough args when yarn strips the -- separator', () => {
        expect(splitCommandArgs([
            '--clear',
            '--scope',
            '@stamhoofd/backend',
            'src/foo.test.ts',
            '--reporter',
            'hanging-process',
        ])).toEqual({
            commandArgs: ['--clear', '--scope', '@stamhoofd/backend', 'src/foo.test.ts'],
            passthroughArgs: ['--reporter', 'hanging-process'],
        });
    });
});
