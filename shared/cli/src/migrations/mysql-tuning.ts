import type { MysqlTuningOptions } from '@stamhoofd/migrations-manager';
import { Flags } from '@oclif/core';

const defaults: MysqlTuningOptions = {
    unsafe: true,
    bufferPoolSize: '8G',
    redoLogCapacity: '4G',
    logBufferSize: '256M',
    ioCapacity: 20000,
    ioCapacityMax: 40000,
    changeBuffering: 'all',
    changeBufferMaxSize: 50,
};

export const mysqlTuningFlags = {
    'safe-mysql': Flags.boolean({ description: 'Disable unsafe one-shot MySQL import/migration optimizations.', default: false }),
    'mysql-buffer-pool-size': Flags.string({ description: 'InnoDB buffer pool size for migration image containers.', default: '8G' }),
    'mysql-redo-log-capacity': Flags.string({ description: 'InnoDB redo log capacity for migration image containers.', default: '4G' }),
    'mysql-log-buffer-size': Flags.string({ description: 'InnoDB log buffer size for migration image containers.', default: '256M' }),
    'mysql-io-capacity': Flags.integer({ description: 'InnoDB IO capacity for migration image containers.', default: 20000, min: 1 }),
    'mysql-io-capacity-max': Flags.integer({ description: 'InnoDB max IO capacity for migration image containers.', default: 40000, min: 1 }),
    'mysql-change-buffering': Flags.string({ description: 'InnoDB change buffering mode for migration image containers.', default: 'all', options: ['none', 'inserts', 'deletes', 'changes', 'purges', 'all'] }),
    'mysql-change-buffer-max-size': Flags.integer({ description: 'InnoDB change buffer max size percentage for migration image containers.', default: 50, min: 0, max: 50 }),
};

export function resolveMysqlTuningFlags(flags: Record<string, unknown>): MysqlTuningOptions {
    const bufferPoolSize = String(flags['mysql-buffer-pool-size'] ?? defaults.bufferPoolSize);
    const redoLogCapacity = String(flags['mysql-redo-log-capacity'] ?? defaults.redoLogCapacity);
    const logBufferSize = String(flags['mysql-log-buffer-size'] ?? defaults.logBufferSize);
    validateMysqlSize(bufferPoolSize, 'mysql-buffer-pool-size');
    validateMysqlSize(redoLogCapacity, 'mysql-redo-log-capacity');
    validateMysqlSize(logBufferSize, 'mysql-log-buffer-size');

    return {
        unsafe: flags['safe-mysql'] === undefined ? defaults.unsafe : !flags['safe-mysql'],
        bufferPoolSize,
        redoLogCapacity,
        logBufferSize,
        ioCapacity: Number(flags['mysql-io-capacity'] ?? defaults.ioCapacity),
        ioCapacityMax: Number(flags['mysql-io-capacity-max'] ?? defaults.ioCapacityMax),
        changeBuffering: (flags['mysql-change-buffering'] ?? defaults.changeBuffering) as MysqlTuningOptions['changeBuffering'],
        changeBufferMaxSize: Number(flags['mysql-change-buffer-max-size'] ?? defaults.changeBufferMaxSize),
    };
}

function validateMysqlSize(value: string, flag: string): void {
    if (!/^\d+(?:[KMGTP])?$/i.test(value)) {
        throw new Error(`Invalid --${flag}: expected a MySQL size such as 512M, 8G, or 1073741824.`);
    }
}
