export type BuildMode = 'auto' | 'skip' | 'force';

export type MigrationPackage = 'models' | 'email' | 'api';

export type MigrationCatalogEntry = {
    index: number;
    id: string;
    normalizedFile: string;
    sourcePath: string;
    package: MigrationPackage;
    sha256: string;
};

export type MigrationCatalogSnapshot = {
    version: 1;
    createdAt: string;
    rootDir: string;
    gitRevision?: string;
    hash: string;
    entries: MigrationCatalogEntry[];
};

export type ChangedMigrationFile = {
    normalizedFile: string;
    previousSha256?: string;
    currentSha256?: string;
    status: 'added' | 'removed' | 'changed';
};

export type RunMigrationChainOptions = {
    rootDir?: string;
    baseImage: string;
    tagPrefix: string;
    database: string;
    startFrom?: string;
    previousChainId?: string;
    previousCatalog?: MigrationCatalogSnapshot;
    allowChangedFiles?: boolean;
    continueOnFailure?: boolean;
    build?: BuildMode;
    mysqlImage?: string;
    mysqlTuning?: MysqlTuningOptions;
    verbose?: boolean;
    env?: NodeJS.ProcessEnv;
    runtime?: ContainerRuntime;
    chainId?: string;
    catalog?: MigrationCatalogSnapshot;
    limit?: number;
    telemetry?: boolean;
    onProgress?: (event: MigrationProgressEvent) => void;
};

export type BaseImageOptions = {
    rootDir?: string;
    dump?: string;
    dumpGpgHome?: string;
    database: string;
    tag: string;
    mysqlImage?: string;
    mysqlTuning?: MysqlTuningOptions;
    verbose?: boolean;
    runtime?: ContainerRuntime;
    chainId?: string;
    displayName?: string;
    telemetry?: boolean;
    onProgress?: (event: BaseImageProgressEvent) => void;
};

export type MysqlTuningOptions = {
    unsafe: boolean;
    bufferPoolSize: string;
    redoLogCapacity: string;
    logBufferSize: string;
    ioCapacity: number;
    ioCapacityMax: number;
    changeBuffering: 'none' | 'inserts' | 'deletes' | 'changes' | 'purges' | 'all';
    changeBufferMaxSize: number;
};

export type BaseImageResult = {
    chainId: string;
    image: string;
    imageId: string;
    dumpSha256?: string;
    manifest: MigrationImageManifest;
};

export type MigrationExecutionResult = {
    migration: MigrationCatalogEntry;
    status: 'success' | 'failed';
    image: string;
    imageId: string;
    startedAt: string;
    finishedAt: string;
    log: string;
    error?: string;
};

export type MigrationChainResult = {
    chainId: string;
    catalog: MigrationCatalogSnapshot;
    changedFiles: ChangedMigrationFile[];
    results: MigrationExecutionResult[];
    timings?: MigrationChainTimings;
};

export type MigrationChainTimings = {
    totalMs: number;
    measuredPhaseMs: number;
    unaccountedMs: number;
    migrations: Array<{
        migration: string;
        image: string;
        status: 'success' | 'failed';
        timings: MigrationTimings;
    }>;
    phaseTotals: Array<{
        name: string;
        totalMs: number;
        count: number;
    }>;
};

export type MigrationImageManifest = {
    version: 1;
    chainId: string;
    role: 'base' | 'migration';
    status: 'base' | 'success' | 'failed';
    database: string;
    image?: string;
    displayName?: string;
    parentImage?: string;
    migration?: MigrationCatalogEntry;
    catalog?: MigrationCatalogSnapshot;
    dumpSha256?: string;
    emptyBase?: boolean;
    changedFiles?: ChangedMigrationFile[];
    previousCatalogHash?: string;
    startedAt: string;
    finishedAt: string;
    error?: string;
    logPath?: string;
    runtime?: string;
    mysqlImage?: string;
    previousChainId?: string;
    baseMigrationCount?: number;
    baseMigrationTotal?: number;
    baseLastMigration?: string;
    baseLastMigrationIndex?: number;
    timings?: MigrationTimings;
};

export type BaseImageProgressEvent =
    | { type: 'phase:start'; phase: string; message: string }
    | { type: 'phase:finish'; phase: string; message: string }
    | { type: 'import:progress'; receivedBytes?: number; totalBytes?: number; createdTables?: number; totalTables?: number; rows?: number; metadataStatus?: 'scanning' | 'done' | 'failed' }
    | { type: 'done'; image: string; imageId: string };

export type ImportDumpProgressEvent = {
    receivedBytes?: number;
    totalBytes?: number;
    createdTables?: number;
    totalTables?: number;
    rows?: number;
    metadataStatus?: 'scanning' | 'done' | 'failed';
};

export type MigrationProgressEvent =
    | { type: 'start'; chainId: string; total: number }
    | { type: 'migration:start'; chainId: string; migration: MigrationCatalogEntry; completed: number; total: number }
    | { type: 'phase:start'; chainId: string; migration: MigrationCatalogEntry; phase: string; message: string; completed: number; total: number }
    | { type: 'phase:finish'; chainId: string; migration: MigrationCatalogEntry; phase: string; message: string; completed: number; total: number }
    | { type: 'migration:finish'; chainId: string; result: MigrationExecutionResult; completed: number; total: number }
    | { type: 'done'; chainId: string; completed: number; total: number };

export type MigrationTimingPhase = {
    name: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    status: 'success' | 'failed' | 'skipped';
    data?: Record<string, string | number | boolean | null>;
};

export type MigrationTimings = {
    totalMs: number;
    phases: MigrationTimingPhase[];
};

export type ImageSummary = {
    id: string;
    repository: string;
    tag: string;
    labels: Record<string, string>;
    createdAt?: string;
};

export type ImageMetadata = {
    id: string;
    repoTags: string[];
    labels: Record<string, string>;
};

export type MigrationImageOverview = {
    chainId: string;
    images: ImageSummary[];
    base?: ImageSummary;
    latestSuccess?: ImageSummary;
    failed?: ImageSummary;
    parentChainId?: string;
    status: 'base' | 'success' | 'failed' | 'unknown';
};

export type MigrationImageDetails = {
    image: string;
    metadata: ImageMetadata;
    manifest?: MigrationImageManifest;
    logs?: string;
};

export type RerunStart = {
    baseImage: string;
    startFrom: string;
    previousChainId: string;
    previousCatalog?: MigrationCatalogSnapshot;
};

export type ResolveRerunStartOptions = {
    chainId: string;
    from?: string;
    runtime?: ContainerRuntime;
};

export type CleanupPlan = {
    chains: Array<{
        chainId: string;
        images: ImageSummary[];
    }>;
    images: ImageSummary[];
};

export type CleanupOptions = {
    chainIds?: string[];
    tagPrefix?: string;
    runtime?: ContainerRuntime;
};

export type CleanupResult = {
    removed: string[];
};

export type StaleMigrationOutput = {
    normalizedFile: string;
    sourcePath: string;
    compiledPath: string;
    status: 'missing' | 'stale';
};

export type MigrationDiffOptions = {
    from: string;
    to: string;
    database: string;
    outputPath?: string;
    runtime?: ContainerRuntime;
};

export type MigrationDiffResult = {
    from: string;
    to: string;
    outputPath?: string;
    beforePath?: string;
    afterPath?: string;
    preview: string;
};

export type MigrationSqlExportOptions = {
    image: string;
    database?: string;
    tables?: string[];
    outputPath: string;
    runtime?: ContainerRuntime;
};

export type MigrationSqlExportResult = {
    image: string;
    database: string;
    tables: string[];
    outputPath: string;
};

export type RunResult = {
    stdout: string;
    stderr: string;
    status: number | null;
};

export type RunOptions = {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    input?: string;
    allowFailure?: boolean;
    verbose?: boolean;
};

export type CommitOptions = {
    labels: Record<string, string>;
};

export interface ContainerRuntime {
    readonly command: string;
    run(args: string[], options?: RunOptions): Promise<RunResult>;
    exec(container: string, args: string[], options?: RunOptions): Promise<RunResult>;
    stop(container: string): Promise<void>;
    remove(container: string): Promise<void>;
    commit(container: string, image: string, options: CommitOptions): Promise<string>;
    inspectImage(image: string): Promise<ImageMetadata>;
    listImagesByLabel(label: string): Promise<ImageSummary[]>;
    logs(container: string): Promise<string>;
    copyToContainer(source: string, container: string, destination: string): Promise<void>;
}
