import type { MigrationTimingPhase, MigrationTimings } from './types.js';

type TimingData = Record<string, string | number | boolean | null>;

type StartedPhase = {
    name: string;
    startedAt: string;
    startedMs: number;
    data?: TimingData;
};

export class MigrationTimer {
    private readonly startedMs = nowMs();
    private readonly phases: MigrationTimingPhase[] = [];

    async measure<T>(name: string, data: TimingData | undefined, run: () => Promise<T>): Promise<T> {
        const phase = this.start(name, data);
        try {
            const result = await run();
            this.finish(phase, 'success');
            return result;
        } catch (error) {
            this.finish(phase, 'failed');
            throw error;
        }
    }

    skipped(name: string, data?: TimingData): void {
        const startedAt = new Date().toISOString();
        this.phases.push({
            name,
            startedAt,
            finishedAt: startedAt,
            durationMs: 0,
            status: 'skipped',
            data,
        });
    }

    snapshot(): MigrationTimings {
        return {
            totalMs: roundMs(nowMs() - this.startedMs),
            phases: [...this.phases],
        };
    }

    totalMs(): number {
        return roundMs(nowMs() - this.startedMs);
    }

    private start(name: string, data?: TimingData): StartedPhase {
        return {
            name,
            startedAt: new Date().toISOString(),
            startedMs: nowMs(),
            data,
        };
    }

    private finish(phase: StartedPhase, status: MigrationTimingPhase['status']): void {
        this.phases.push({
            name: phase.name,
            startedAt: phase.startedAt,
            finishedAt: new Date().toISOString(),
            durationMs: roundMs(nowMs() - phase.startedMs),
            status,
            data: phase.data,
        });
    }
}

function nowMs(): number {
    return performance.now();
}

function roundMs(value: number): number {
    return Math.round(value * 100) / 100;
}
