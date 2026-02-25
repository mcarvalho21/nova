/**
 * Metrics collection utilities for stress tests.
 */

export interface LatencyMetrics {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  stddev: number;
}

/**
 * Calculate percentile and summary statistics from a sorted array of latencies.
 */
export function calculateLatencyMetrics(latencies: number[]): LatencyMetrics {
  if (latencies.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0, stddev: 0 };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / count;

  const variance = sorted.reduce((acc, val) => acc + (val - mean) ** 2, 0) / count;

  return {
    count,
    min: sorted[0],
    max: sorted[count - 1],
    mean: Math.round(mean * 100) / 100,
    p50: sorted[Math.floor(count * 0.5)],
    p95: sorted[Math.floor(count * 0.95)],
    p99: sorted[Math.floor(count * 0.99)],
    stddev: Math.round(Math.sqrt(variance) * 100) / 100,
  };
}

/**
 * Throughput tracker: records event counts over time windows.
 */
export class ThroughputTracker {
  private startTime = 0;
  private count = 0;
  private windowCounts: number[] = [];
  private windowStart = 0;
  private readonly windowMs: number;

  constructor(windowMs = 1_000) {
    this.windowMs = windowMs;
  }

  start(): void {
    this.startTime = Date.now();
    this.windowStart = this.startTime;
    this.count = 0;
    this.windowCounts = [];
  }

  record(n = 1): void {
    this.count += n;
    const now = Date.now();
    if (now - this.windowStart >= this.windowMs) {
      this.windowCounts.push(this.count);
      this.count = 0;
      this.windowStart = now;
    }
  }

  finish(): { totalCount: number; durationMs: number; avgPerSecond: number; windowRates: number[] } {
    // Flush remaining
    if (this.count > 0) {
      this.windowCounts.push(this.count);
    }

    const durationMs = Date.now() - this.startTime;
    const totalCount = this.windowCounts.reduce((a, b) => a + b, 0);
    const avgPerSecond = durationMs > 0 ? (totalCount / durationMs) * 1000 : 0;

    return {
      totalCount,
      durationMs,
      avgPerSecond: Math.round(avgPerSecond * 100) / 100,
      windowRates: this.windowCounts.map((c) => (c / this.windowMs) * 1000),
    };
  }
}

/**
 * Memory usage tracker: samples heap usage at intervals.
 */
export class MemoryTracker {
  private samples: { timestamp: number; heapUsedMB: number; rssMB: number }[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;

  start(intervalMs = 1_000): void {
    this.samples = [];
    this.sample();
    this.interval = setInterval(() => this.sample(), intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.sample();
  }

  private sample(): void {
    const mem = process.memoryUsage();
    this.samples.push({
      timestamp: Date.now(),
      heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      rssMB: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
    });
  }

  getReport(): {
    initialHeapMB: number;
    finalHeapMB: number;
    peakHeapMB: number;
    growthMB: number;
    growthPercent: number;
    isStable: boolean;
  } {
    if (this.samples.length < 2) {
      return { initialHeapMB: 0, finalHeapMB: 0, peakHeapMB: 0, growthMB: 0, growthPercent: 0, isStable: true };
    }

    const initial = this.samples[0].heapUsedMB;
    const final = this.samples[this.samples.length - 1].heapUsedMB;
    const peak = Math.max(...this.samples.map((s) => s.heapUsedMB));
    const growth = final - initial;
    const growthPercent = initial > 0 ? (growth / initial) * 100 : 0;

    // Memory is "stable" if:
    // - Overall growth is less than 50%, OR memory actually decreased (negative growth)
    // - The second half is not accelerating relative to the first half
    const midpoint = Math.floor(this.samples.length / 2);
    const firstHalfGrowth = this.samples[midpoint].heapUsedMB - initial;
    const secondHalfGrowth = final - this.samples[midpoint].heapUsedMB;
    const notAccelerating =
      growth <= 0 || // Memory decreased — always stable
      secondHalfGrowth <= 0 || // Second half decreased — stable
      secondHalfGrowth <= Math.max(firstHalfGrowth, 0) * 1.5 + 5; // Allow 5MB noise floor
    const isStable = (growthPercent < 50 || growth <= 0) && notAccelerating;

    return {
      initialHeapMB: initial,
      finalHeapMB: final,
      peakHeapMB: peak,
      growthMB: Math.round(growth * 100) / 100,
      growthPercent: Math.round(growthPercent * 100) / 100,
      isStable,
    };
  }
}

/**
 * Lock contention tracker: monitors pg_stat_activity for waiting queries.
 */
export async function measureLockContention(
  pool: import('pg').Pool,
): Promise<{ waitingQueries: number; lockWaits: number }> {
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE wait_event_type = 'Lock') as lock_waits,
      COUNT(*) FILTER (WHERE state = 'active' AND wait_event IS NOT NULL) as waiting_queries
    FROM pg_stat_activity
    WHERE datname = current_database()
  `);
  return {
    waitingQueries: Number(rows[0].waiting_queries),
    lockWaits: Number(rows[0].lock_waits),
  };
}

/**
 * Timer helper for measuring individual operations.
 */
export function timer(): () => number {
  const start = performance.now();
  return () => Math.round((performance.now() - start) * 100) / 100;
}
