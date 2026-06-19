import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { ciFlag } from '../../command-flags.js';
import { testUnit } from '../../runtime/monorepo-runner.js';

export default class TestUnit extends BaseCommand {
    static strict = false;
    static summary = 'Run unit tests with an isolated test database';
    static description = 'Starts an isolated MySQL test database, then runs unit tests. Files and --test/-t are forwarded to Vitest. Paths are forwarded unchanged to Vitest. When using --scope, provide paths relative to that package, for example src/foo.test.ts for --scope @stamhoofd/backend. Extra unknown arguments are passed to Vitest; use -- before them when invoking stam directly, or yarn stam -- test unit ... -- ... when running through Yarn.';
    static examples = [
        'stam test unit',
        'stam test unit --clear',
        'stam test unit --ci --verbose',
        'stam test unit --scope @stamhoofd/backend src/endpoints/foo.test.ts',
        'stam test unit --scope @stamhoofd/backend src/endpoints/foo.test.ts -t "rejects invalid input"',
        'stam test unit --scope @stamhoofd/backend src/endpoints/foo.test.ts -- --reporter hanging-process',
        'yarn stam -- test unit --scope @stamhoofd/backend src/endpoints/foo.test.ts -- --reporter hanging-process',
    ];

    static args = {
        files: Args.string({
            description: 'Vitest file filters. Paths are forwarded unchanged; with --scope, use paths relative to the scoped package.',
            required: false,
            multiple: true,
        }),
    };

    static flags = {
        ...BaseCommand.verboseFlags,
        ci: ciFlag,
        clear: Flags.boolean({ default: false, description: 'Clear the prepared unit test database image before running tests' }),
        scope: Flags.string({
            description: 'Lerna package scope to run, for example @stamhoofd/backend.',
        }),
        test: Flags.string({
            char: 't',
            description: 'Vitest test name pattern. Forwarded as -t and may be any pattern Vitest accepts.',
        }),
    };

    async run(): Promise<void> {
        const { commandArgs, passthroughArgs } = splitCommandArgs(this.argv);
        const { args, flags } = await this.parse(TestUnit, commandArgs);
        const files = Array.isArray(args.files) ? args.files : [];
        const vitestArgs = buildVitestArgs(files, flags.test, passthroughArgs);

        await testUnit(await this.createContext(flags), {
            ci: flags.ci,
            clear: flags.clear,
            scopes: flags.scope ? [flags.scope] : undefined,
            vitestArgs,
        });
    }

}

export function splitCommandArgs(argv: string[]): { commandArgs: string[]; passthroughArgs: string[] } {
    const separatorIndex = argv.indexOf('--');
    if (separatorIndex !== -1) {
        return {
            commandArgs: argv.slice(0, separatorIndex),
            passthroughArgs: argv.slice(separatorIndex + 1),
        };
    }

    return splitStrippedPassthroughArgs(argv);
}

export function buildVitestArgs(files: string[], test: string | undefined, passthroughArgs: string[] = []): string[] {
    return [
        ...files,
        ...(test ? ['-t', test] : []),
        ...passthroughArgs,
    ];
}

function isKnownFlag(arg: string): boolean {
    return arg === '--verbose'
        || arg === '--ci'
        || arg === '--clear'
        || arg === '--scope'
        || arg.startsWith('--scope=')
        || arg === '--test'
        || arg.startsWith('--test=')
        || arg === '-t';
}

function splitStrippedPassthroughArgs(argv: string[]): { commandArgs: string[]; passthroughArgs: string[] } {
    const commandArgs: string[] = [];
    const passthroughArgs: string[] = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('-') && !isKnownFlag(arg)) {
            passthroughArgs.push(...argv.slice(i));
            break;
        }

        commandArgs.push(arg);
        if (takesValue(arg) && !arg.includes('=') && i + 1 < argv.length) {
            commandArgs.push(argv[++i]);
        }
    }

    return { commandArgs, passthroughArgs };
}

function takesValue(arg: string): boolean {
    return arg === '--scope' || arg === '--test' || arg === '-t';
}
