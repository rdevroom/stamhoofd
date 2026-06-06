import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawn, type ChildProcess } from 'node:child_process';
import { createGunzip } from 'node:zlib';
import type { Readable } from 'node:stream';

export type DumpMetadata = {
    totalTables?: number;
};

export type ScanDumpMetadataOptions = {
    gpgHome?: string;
    signal?: AbortSignal;
};

const createTableRegex = /^\s*CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i;

export async function scanDumpMetadata(dump: string, options: ScanDumpMetadataOptions = {}): Promise<DumpMetadata> {
    const source = createDumpReadStream(dump, options);
    const cleanup = () => source.cleanup();
    options.signal?.addEventListener('abort', cleanup, { once: true });

    try {
        let totalTables = 0;
        const lines = createInterface({ input: source.stream, crlfDelay: Infinity });
        for await (const line of lines) {
            if (options.signal?.aborted) {
                break;
            }
            if (createTableRegex.test(line)) {
                totalTables++;
            }
        }
        if (options.signal?.aborted) {
            return {};
        }
        return { totalTables };
    } finally {
        options.signal?.removeEventListener('abort', cleanup);
        cleanup();
    }
}

function createDumpReadStream(dump: string, options: ScanDumpMetadataOptions): { stream: Readable; cleanup: () => void } {
    const lower = dump.toLowerCase();
    const encrypted = /(?:\.sql|\.dump)(?:\.gz)?\.(?:gpg|enc)$/.test(lower);
    const compressed = /(?:\.sql|\.dump)\.gz(?:\.(?:gpg|enc))?$/.test(lower);

    const children: ChildProcess[] = [];
    const streams: Readable[] = [];

    let stream: Readable;
    if (encrypted) {
        const gpgArgs = [...(options.gpgHome ? ['--homedir', options.gpgHome] : []), '--batch', '--decrypt', dump];
        const child = spawn('gpg', gpgArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
        child.stderr.resume();
        children.push(child);
        stream = child.stdout;
    } else {
        stream = createReadStream(dump);
    }
    streams.push(stream);

    if (compressed) {
        const gunzip = createGunzip();
        stream.pipe(gunzip);
        stream = gunzip;
        streams.push(stream);
    }

    return {
        stream,
        cleanup() {
            for (const readable of streams) {
                readable.destroy();
            }
            for (const child of children) {
                if (!child.killed) {
                    child.kill();
                }
            }
        },
    };
}
