import backendEnv from '@stamhoofd/backend-env';

function readOption(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
}

backendEnv.load({ service: 'api' }).catch((error) => {
    console.error('Failed to load environment:', error);
    process.exit(1);
}).then(async () => {
    applyDatabaseEnvironmentOverrides();
    const file = readOption('file') ?? process.env.MIGRATION_FILE;
    const name = readOption('name') ?? process.env.MIGRATION_NAME;
    if (!file || !name) {
        throw new Error('Usage: single-migration --file <compiled migration path> --name <normalized migration filename>');
    }
    const { runSingleMigration } = await import('./src/migrations-runner/run-single.js');
    await runSingleMigration({ file, name });
    process.exit(0);
}).catch((error) => {
    console.error('Failed to run single migration:', error);
    process.exit(1);
});

function applyDatabaseEnvironmentOverrides(): void {
    const overrides = {
        DB_HOST: process.env.MIGRATION_DB_HOST ?? process.env.DB_HOST,
        DB_PORT: process.env.MIGRATION_DB_PORT ?? process.env.DB_PORT,
        DB_DATABASE: process.env.MIGRATION_DB_DATABASE ?? process.env.DB_DATABASE,
        DB_USER: process.env.MIGRATION_DB_USER ?? process.env.DB_USER,
        DB_PASS: process.env.MIGRATION_DB_PASS ?? process.env.DB_PASS,
    };

    for (const [key, value] of Object.entries(overrides)) {
        if (!value) {
            continue;
        }
        process.env[key] = value;
        (global as any).STAMHOOFD[key] = value;
    }
}
