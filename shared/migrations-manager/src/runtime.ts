import { spawn } from 'node:child_process';
import type { CommitOptions, ContainerRuntime, ImageMetadata, ImageSummary, RunOptions, RunResult } from './types.js';

export async function createCliContainerRuntime(): Promise<ContainerRuntime> {
    const podman = await runCommand('podman', ['--version'], { allowFailure: true });
    if (podman.status === 0) {
        await runCommand('podman', ['info']);
        return new CliContainerRuntime('podman');
    }

    await runCommand('docker', ['info']);
    return new CliContainerRuntime('docker');
}

export class CliContainerRuntime implements ContainerRuntime {
    constructor(readonly command: string) {}

    async run(args: string[], options: RunOptions = {}): Promise<RunResult> {
        return await runCommand(this.command, args, options);
    }

    async exec(container: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
        return await this.run(['exec', container, ...args], options);
    }

    async stop(container: string): Promise<void> {
        await this.run(['stop', container], { allowFailure: true });
    }

    async remove(container: string): Promise<void> {
        await this.run(['rm', '-f', container], { allowFailure: true });
    }

    async commit(container: string, image: string, options: CommitOptions): Promise<string> {
        const labelArgs = Object.entries(options.labels).flatMap(([key, value]) => ['--change', `LABEL ${key}=${JSON.stringify(value)}`]);
        const result = await this.run(['commit', ...labelArgs, container, image]);
        return result.stdout.trim();
    }

    async inspectImage(image: string): Promise<ImageMetadata> {
        const result = await this.run(['image', 'inspect', image], { allowFailure: true });
        if (result.status !== 0) {
            throw new Error(`Image not found: ${image}`);
        }
        const [data] = JSON.parse(result.stdout) as Array<{ Id?: string; RepoTags?: string[]; Config?: { Labels?: Record<string, string> } }>;
        return {
            id: data.Id ?? image,
            repoTags: data.RepoTags ?? [],
            labels: data.Config?.Labels ?? {},
        };
    }

    async listImagesByLabel(label: string): Promise<ImageSummary[]> {
        const format = '{{json .}}';
        const result = await this.run(['images', '--filter', `label=${label}`, '--format', format]);
        return result.stdout.split('\n').filter(Boolean).map((line) => {
            const data = JSON.parse(line) as { ID?: string; Id?: string; Repository?: string; repository?: string; Tag?: string; tag?: string; CreatedAt?: string; Created?: string | number; Labels?: string | Record<string, string> };
            return {
                id: data.ID ?? data.Id ?? '',
                repository: data.Repository ?? data.repository ?? '',
                tag: data.Tag ?? data.tag ?? '',
                labels: parseDockerLabels(data.Labels ?? ''),
                createdAt: data.CreatedAt ?? String(data.Created ?? ''),
            };
        });
    }

    async logs(container: string): Promise<string> {
        const result = await this.run(['logs', container], { allowFailure: true });
        return [result.stdout, result.stderr].filter(Boolean).join('\n');
    }

    async copyToContainer(source: string, container: string, destination: string): Promise<void> {
        await this.run(['cp', source, `${container}:${destination}`]);
    }
}

export async function runCommand(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
    if (options.verbose) {
        console.log([command, ...args].join(' '));
    }

    return await new Promise<RunResult>((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: { ...process.env, ...options.env },
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => stdout += String(chunk));
        child.stderr.on('data', chunk => stderr += String(chunk));
        child.on('error', (error) => {
            if (options.allowFailure) {
                resolve({ stdout, stderr: String(error), status: 1 });
                return;
            }
            reject(error);
        });
        child.on('exit', (status) => {
            if (status === 0 || options.allowFailure) {
                resolve({ stdout, stderr, status });
                return;
            }
            reject(new Error(`${command} ${args.join(' ')} exited with status ${status}${stderr ? `: ${stderr.trim()}` : ''}`));
        });
        if (options.input) {
            child.stdin.write(options.input);
        }
        child.stdin.end();
    });
}

function parseDockerLabels(labels: string | Record<string, string>): Record<string, string> {
    if (typeof labels === 'object') {
        return labels;
    }
    const result: Record<string, string> = {};
    if (!labels) {
        return result;
    }
    for (const label of labels.split(',')) {
        const separator = label.indexOf('=');
        if (separator === -1) {
            result[label] = '';
            continue;
        }
        result[label.slice(0, separator)] = label.slice(separator + 1);
    }
    return result;
}
