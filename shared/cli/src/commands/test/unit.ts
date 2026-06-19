import { Args, Flags } from '@oclif/core';
import { BaseCommand } from '../../base-command.js';
import { ciFlag } from '../../command-flags.js';
import { testUnit } from '../../runtime/monorepo-runner.js';

export default class TestUnit extends BaseCommand {
    static summary = 'Run unit tests with an isolated test database';
    static description = 'Starts an isolated MySQL test database, then runs unit tests. Files and --test/-t are forwarded to Vitest. Paths are forwarded unchanged to Vitest. When using --scope, provide paths relative to that package, for example src/foo.test.ts for --scope @stamhoofd/backend.';
    static examples = [
        'stam test unit',
        'stam test unit --ci --verbose',
        'stam test unit --scope @stamhoofd/backend src/endpoints/foo.test.ts',
        'stam test unit --scope @stamhoofd/backend src/endpoints/foo.test.ts -t "rejects invalid input"',
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
        scope: Flags.string({
            description: 'Lerna package scope to run, for example @stamhoofd/backend.',
        }),
        test: Flags.string({
            char: 't',
            description: 'Vitest test name pattern. Forwarded as -t and may be any pattern Vitest accepts.',
        }),
    };

    async run(): Promise<void> {
        const { args, flags } = await this.parse(TestUnit);
        const files = Array.isArray(args.files) ? args.files : [];
        const vitestArgs = [
            ...files,
            ...(flags.test ? ['-t', flags.test] : []),
        ];

        await testUnit(await this.createContext(flags), {
            ci: flags.ci,
            scopes: flags.scope ? [flags.scope] : undefined,
            vitestArgs,
        });
    }
}
