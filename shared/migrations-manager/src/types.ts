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
    verbose?: boolean;
    env?: NodeJS.ProcessEnv;
    runtime?: ContainerRuntime;
    chainId?: string;
};

export type BaseImageOptions = {
    rootDir?: string;
    dump?: string;
    database: string;
    tag: string;
    mysqlImage?: string;
    verbose?: boolean;
    runtime?: ContainerRuntime;
    chainId?: string;
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
};

export type MigrationImageManifest = {
    version: 1;
    chainId: string;
    role: 'base' | 'migration';
    status: 'base' | 'success' | 'failed';
    database: string;
    image?: string;
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
    status: 'base' | 'success' | 'failed' | 'unknown';
};

export type MigrationImageDetails = {
    image: string;
    metadata: ImageMetadata;
    manifest?: MigrationImageManifest;
};

export type RerunStart = {
    baseImage: string;
    startFrom: string;
    previousChainId: string;
    previousCatalog?: MigrationCatalogSnapshot;
};

export type ResolveRerunStartOptions = {
    chainId: string;
    from: string;
    runtime?: ContainerRuntime;
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
