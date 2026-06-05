import chalk from 'chalk';
import { stripVTControlCharacters } from 'node:util';

export function friendlyMigrationName(file: string): string {
    const withoutExtension = file.replace(/\.[^.]+$/, '');
    const withoutPrefix = withoutExtension.replace(/^\d+[-_]+/, '');
    const words = withoutPrefix.replace(/[-_]+/g, ' ').trim();
    if (!words) {
        return file;
    }
    return words.replace(/\b\w/g, letter => letter.toUpperCase());
}

export function formatMigrationLabel(file: string): string {
    if (file === 'base') {
        return 'Empty database';
    }
    return `${friendlyMigrationName(file)}\n${chalk.dim(file)}`;
}

export function formatRelativeTime(value: string | Date | undefined, now = new Date()): string {
    const date = parseDate(value);
    if (!date) {
        return '-';
    }

    const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
    const absolute = Math.abs(diffSeconds);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
        ['year', 60 * 60 * 24 * 365],
        ['month', 60 * 60 * 24 * 30],
        ['week', 60 * 60 * 24 * 7],
        ['day', 60 * 60 * 24],
        ['hour', 60 * 60],
        ['minute', 60],
        ['second', 1],
    ];
    const [unit, seconds] = units.find(([, size]) => absolute >= size) ?? ['second', 1];
    return rtf.format(Math.round(diffSeconds / seconds), unit);
}

export function formatExactTime(value: string | Date | undefined): string {
    const date = parseDate(value);
    if (!date) {
        return '-';
    }
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

export function formatDuration(start: string | Date | undefined, end: string | Date | undefined): string {
    const startDate = parseDate(start);
    const endDate = parseDate(end);
    if (!startDate || !endDate) {
        return '-';
    }
    const totalSeconds = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) {
        return `${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
}

export function formatStatus(status: string): string {
    if (status === 'success') {
        return 'Success';
    }
    if (status === 'failed') {
        return 'Failed';
    }
    if (status === 'base') {
        return 'Base';
    }
    return 'Unknown';
}

export function formatStatusColor(status: string): string {
    const label = formatStatus(status);
    if (status === 'success') {
        return chalk.green(label);
    }
    if (status === 'failed') {
        return chalk.red(label);
    }
    if (status === 'base') {
        return chalk.dim(label);
    }
    return chalk.yellow(label);
}

export function formatStatusIcon(status: string): string {
    if (status === 'success') {
        return chalk.green('✓');
    }
    if (status === 'failed') {
        return chalk.red('✖');
    }
    return chalk.dim('○');
}

export function formatMigrationNumber(index: number): string {
    return `#${index + 1}`;
}

export function formatMigrationProgress(completed: number, total: number): string {
    return `${completed}/${total}`;
}

export function padColumns(columns: string[], widths: number[]): string {
    return columns.map((column, index) => padVisible(column, widths[index] ?? 0)).join('  ').trimEnd();
}

export function padVisible(value: string, width: number): string {
    return value + ' '.repeat(Math.max(0, width - stripVTControlCharacters(value).length));
}

export function truncateVisible(value: string, maxLength: number): string {
    if (stripVTControlCharacters(value).length <= maxLength) {
        return value;
    }
    if (maxLength <= 1) {
        return '…'.slice(0, maxLength);
    }
    return `${stripVTControlCharacters(value).slice(0, maxLength - 1)}…`;
}

function parseDate(value: string | Date | undefined): Date | undefined {
    if (!value) {
        return undefined;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}
