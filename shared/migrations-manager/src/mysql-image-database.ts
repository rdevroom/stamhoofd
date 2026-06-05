import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ContainerRuntime, MigrationImageManifest, RunResult } from './types.js';

const mysqlUser = 'root';
const mysqlPassword = 'root';
const mysqlHost = '127.0.0.1';
const mysqlPort = '3306';

export class MysqlImageDatabase {
    constructor(private readonly runtime: ContainerRuntime, private readonly verbose = false) {}

    async start(image: string, name: string, options: { publishPort?: boolean } = {}): Promise<void> {
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
        args.push(image, '--datadir=/stamhoofd-mysql-data', '--mysql-native-password=ON', '--sort-buffer-size=2M');
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

    async importDump(container: string, dump: string, database: string): Promise<void> {
        const extension = path.extname(dump);
        if (extension !== '.dump' && extension !== '.sql') {
            throw new Error(`Unsupported dump extension: ${extension}. Only .dump and .sql are supported.`);
        }
        await this.runtime.exec(container, ['mkdir', '-p', '/stamhoofd']);
        await this.runtime.copyToContainer(dump, container, '/stamhoofd/import.dump');
        await this.runtime.exec(container, ['sh', '-lc', `mysql -h${mysqlHost} -u${mysqlUser} -p${mysqlPassword} --max_allowed_packet=1G ${shellQuote(database)} < /stamhoofd/import.dump`]);
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

function shellQuote(value: string): string {
    return `'${value.replaceAll('\'', '\'"\'"\'')}'`;
}
