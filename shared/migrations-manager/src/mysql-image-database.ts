import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanDumpMetadata } from './dump-metadata.js';
import { runPipeline, type PipelineCommand } from './runtime.js';
import type { ContainerRuntime, ImportDumpProgressEvent, MigrationImageManifest, MysqlTuningOptions, RunResult } from './types.js';

const mysqlUser = 'root';
const mysqlPassword = 'root';
const mysqlHost = '127.0.0.1';
const mysqlPort = '3306';

export class MysqlImageDatabase {
    constructor(private readonly runtime: ContainerRuntime, private readonly verbose = false) {}

    async start(image: string, name: string, options: { publishPort?: boolean; tuning?: MysqlTuningOptions } = {}): Promise<void> {
        await this.runtime.remove(name);
        const args = [
            'run',
            '-d',
            '--name', name,
            '-e', `MYSQL_ROOT_PASSWORD=${mysqlPassword}`,
        ];
        if (options.publishPort) {
            args.push('-p', '127.0.0.1::3306');
        }
        args.push(image, '--datadir=/stamhoofd-mysql-data', '--mysql-native-password=ON', '--sort-buffer-size=2M', ...mysqlTuningArgs(options.tuning));
        await this.runtime.run(args, { verbose: this.verbose });
        await this.waitForMysql(name);
    }

    async mappedPort(container: string): Promise<string> {
        const result = await this.runtime.run(['port', container, '3306/tcp']);
        const port = result.stdout.trim().split(':').at(-1);
        if (!port) {
            throw new Error(`Could not determine mapped MySQL port for ${container}`);
        }
        return port;
    }

    async createDatabase(container: string, database: string): Promise<void> {
        await this.execMysql(container, ['-e', `CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET = \`utf8mb4\` DEFAULT COLLATE = \`utf8mb4_0900_ai_ci\`;`]);
    }

    async importDump(container: string, dump: string, database: string, options: { gpgHome?: string; onProgress?: (event: ImportDumpProgressEvent) => void } = {}): Promise<void> {
        const progress = new ImportDumpProgress(this.runtime, container, database, dump, options);
        await progress.start();
        try {
            await runPipeline([
                ...dumpSourceCommands(dump, options),
                {
                    command: this.runtime.command,
                    args: ['exec', '-i', container, 'mysql', `-h${mysqlHost}`, `-u${mysqlUser}`, `-p${mysqlPassword}`, '--max_allowed_packet=1G', `--init-command=${importInitCommand}`, database],
                },
            ], { verbose: this.verbose });
        } finally {
            await progress.stop();
        }
    }

    async disableRedoLog(container: string): Promise<void> {
        await this.execMysql(container, ['-e', 'ALTER INSTANCE DISABLE INNODB REDO_LOG;']);
    }

    async enableRedoLog(container: string): Promise<void> {
        await this.execMysql(container, ['-e', 'ALTER INSTANCE ENABLE INNODB REDO_LOG;']);
    }

    async listExecutedMigrations(container: string, database: string): Promise<string[]> {
        const result = await this.execMysql(container, ['-N', '-B', '-e', `SELECT \`file\` FROM \`${database}\`.\`migrations\` ORDER BY \`executedOn\`;`], { allowFailure: true });
        if (result.status !== 0) {
            return [];
        }
        return result.stdout.split('\n').map(line => line.trim()).filter(Boolean);
    }

    async writeManifest(container: string, manifest: MigrationImageManifest, logs: Record<string, string> = {}): Promise<void> {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'stamhoofd-migrations-'));
        try {
            await fs.mkdir(path.join(tmp, 'logs'), { recursive: true });
            await fs.writeFile(path.join(tmp, 'manifest.json'), JSON.stringify(manifest, null, 4));
            for (const [name, log] of Object.entries(logs)) {
                await fs.writeFile(path.join(tmp, 'logs', name), log);
            }
            await this.runtime.exec(container, ['mkdir', '-p', '/stamhoofd-migrations']);
            await this.runtime.copyToContainer(`${tmp}/.`, container, '/stamhoofd-migrations');
        } finally {
            await fs.rm(tmp, { recursive: true, force: true });
        }
    }

    async stopForCommit(container: string): Promise<void> {
        await this.runtime.exec(container, ['mysqladmin', `-h${mysqlHost}`, `-u${mysqlUser}`, `-p${mysqlPassword}`, 'shutdown'], { allowFailure: true });
        await this.runtime.stop(container);
    }

    private async waitForMysql(container: string): Promise<void> {
        for (let i = 0; i < 360; i++) {
            const result = await this.runtime.exec(container, ['mysql', `-h${mysqlHost}`, `-u${mysqlUser}`, `-p${mysqlPassword}`, '-e', 'SELECT 1'], { allowFailure: true });
            if (result.status === 0) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 250));
        }
        throw new Error('MySQL did not become ready in time.');
    }

    private async execMysql(container: string, args: string[], options: { allowFailure?: boolean } = {}): Promise<RunResult> {
        return await this.runtime.exec(container, ['mysql', `-h${mysqlHost}`, `-u${mysqlUser}`, `-p${mysqlPassword}`, ...args], options);
    }
}

class ImportDumpProgress {
    private readonly abortController = new AbortController();
    private interval: NodeJS.Timeout | undefined;
    private baselineReceivedBytes: number | undefined;
    private latest: ImportDumpProgressEvent = { metadataStatus: 'scanning' };
    private scanPromise: Promise<void> | undefined;
    private pollPromise: Promise<void> | undefined;
    private stopped = false;

    constructor(
        private readonly runtime: ContainerRuntime,
        private readonly container: string,
        private readonly database: string,
        private readonly dump: string,
        private readonly options: { gpgHome?: string; onProgress?: (event: ImportDumpProgressEvent) => void },
    ) {}

    async start(): Promise<void> {
        this.baselineReceivedBytes = await this.readReceivedBytes().catch(() => undefined);
        const totalBytes = await this.readExpectedBytes().catch(() => undefined);
        this.emit({ metadataStatus: 'scanning', totalBytes });
        this.scanPromise = this.scanMetadata();
        this.interval = setInterval(() => {
            this.startPoll();
        }, 500);
        this.startPoll();
    }

    async stop(): Promise<void> {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = undefined;
        }
        await this.pollPromise?.catch(() => undefined);
        await this.poll().catch(() => undefined);
        this.stopped = true;
        this.abortController.abort();
        await this.scanPromise?.catch(() => undefined);
    }

    private startPoll(): void {
        if (this.stopped || this.pollPromise) {
            return;
        }
        this.pollPromise = this.poll().finally(() => {
            this.pollPromise = undefined;
        });
    }

    private async scanMetadata(): Promise<void> {
        try {
            const metadata = await scanDumpMetadata(this.dump, { gpgHome: this.options.gpgHome, signal: this.abortController.signal });
            if (!this.abortController.signal.aborted) {
                this.emit({ totalTables: metadata.totalTables, metadataStatus: 'done' });
            }
        } catch (error) {
            if (!this.abortController.signal.aborted) {
                this.emit({ metadataStatus: 'failed' });
            }
        }
    }

    private async poll(): Promise<void> {
        const [receivedBytes, tableStats] = await Promise.all([
            this.readReceivedBytes().catch(() => undefined),
            this.readTableStats().catch(() => undefined),
        ]);
        const currentReceivedBytes = receivedBytes !== undefined && this.baselineReceivedBytes !== undefined ? Math.max(0, receivedBytes - this.baselineReceivedBytes) : undefined;
        this.emitMonotonic({
            receivedBytes: currentReceivedBytes,
            createdTables: tableStats?.createdTables,
            rows: tableStats?.rows,
        }, ['receivedBytes', 'createdTables', 'rows']);
    }

    private async readReceivedBytes(): Promise<number> {
        const result = await this.runtime.exec(this.container, ['mysql', `-h${mysqlHost}`, `-u${mysqlUser}`, `-p${mysqlPassword}`, '-N', '-B', '-e', "SHOW GLOBAL STATUS LIKE 'Bytes_received';"], { allowFailure: true });
        if (result.status !== 0) {
            throw new Error(result.stderr || 'Could not read Bytes_received');
        }
        const value = Number(result.stdout.trim().split(/\s+/).at(-1));
        if (!Number.isFinite(value)) {
            throw new Error('Could not parse Bytes_received');
        }
        return value;
    }

    private async readTableStats(): Promise<{ createdTables: number; rows: number }> {
        const escapedDatabase = this.database.replace(/'/g, "''");
        const result = await this.runtime.exec(this.container, ['mysql', `-h${mysqlHost}`, `-u${mysqlUser}`, `-p${mysqlPassword}`, '-N', '-B', '-e', `SELECT COUNT(*), COALESCE(SUM(TABLE_ROWS), 0) FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${escapedDatabase}';`], { allowFailure: true });
        if (result.status !== 0) {
            throw new Error(result.stderr || 'Could not read table stats');
        }
        const [createdTables, rows] = result.stdout.trim().split(/\s+/).map(value => Number(value));
        if (![createdTables, rows].every(Number.isFinite)) {
            throw new Error('Could not parse table stats');
        }
        return { createdTables, rows };
    }

    private async readExpectedBytes(): Promise<number | undefined> {
        if (!hasDumpExtension(this.dump, ['.sql', '.dump'])) {
            return undefined;
        }
        const stat = await fs.stat(this.dump);
        return stat.size;
    }

    private emit(event: ImportDumpProgressEvent): void {
        if (this.stopped) {
            return;
        }
        this.latest = { ...this.latest, ...event };
        this.options.onProgress?.(this.latest);
    }

    private emitMonotonic(event: ImportDumpProgressEvent, keys: Array<keyof ImportDumpProgressEvent>): void {
        const next = { ...event };
        for (const key of keys) {
            const value = next[key];
            const previous = this.latest[key];
            if (typeof value === 'number' && typeof previous === 'number') {
                (next as Record<string, unknown>)[key] = Math.max(previous, value);
            }
        }
        this.emit(next);
    }
}

const importInitCommand = 'SET SESSION sql_log_bin=0; SET SESSION foreign_key_checks=0; SET SESSION unique_checks=0;';

function mysqlTuningArgs(tuning: MysqlTuningOptions | undefined): string[] {
    if (!tuning?.unsafe) {
        return [];
    }

    return [
        `--innodb-buffer-pool-size=${tuning.bufferPoolSize}`,
        `--innodb-redo-log-capacity=${tuning.redoLogCapacity}`,
        `--innodb-log-buffer-size=${tuning.logBufferSize}`,
        `--innodb-io-capacity=${tuning.ioCapacity}`,
        `--innodb-io-capacity-max=${tuning.ioCapacityMax}`,
        `--innodb-change-buffering=${tuning.changeBuffering}`,
        `--innodb-change-buffer-max-size=${tuning.changeBufferMaxSize}`,
        '--innodb-flush-log-at-trx-commit=0',
        '--sync-binlog=0',
        '--disable-log-bin',
        '--skip-innodb-doublewrite',
        '--innodb-flush-method=O_DIRECT',
        '--innodb-flush-neighbors=0',
        '--innodb-autoinc-lock-mode=2',
    ];
}

function dumpSourceCommands(dump: string, options: { gpgHome?: string }): PipelineCommand[] {
    const gpgArgs = [...(options.gpgHome ? ['--homedir', options.gpgHome] : []), '--batch', '--decrypt', dump];
    if (hasDumpExtension(dump, ['.sql.gz.gpg', '.dump.gz.gpg', '.sql.gz.enc', '.dump.gz.enc'])) {
        return [
            { command: 'gpg', args: gpgArgs },
            { command: 'gzip', args: ['-dc'] },
        ];
    }
    if (hasDumpExtension(dump, ['.sql.gpg', '.dump.gpg', '.sql.enc', '.dump.enc'])) {
        return [{ command: 'gpg', args: gpgArgs }];
    }
    if (hasDumpExtension(dump, ['.sql.gz', '.dump.gz'])) {
        return [{ command: 'gzip', args: ['-dc', dump] }];
    }
    if (hasDumpExtension(dump, ['.sql', '.dump'])) {
        return [{ command: 'cat', args: [dump] }];
    }

    throw new Error(`Unsupported dump extension. Supported formats are .sql, .sql.gz, .sql.gpg/.sql.enc, and .sql.gz.gpg/.sql.gz.enc.`);
}

function hasDumpExtension(dump: string, extensions: string[]): boolean {
    const lower = dump.toLowerCase();
    return extensions.some(extension => lower.endsWith(extension));
}
