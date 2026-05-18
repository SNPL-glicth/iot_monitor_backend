/**
 * Metrics Service
 * 
 * Lightweight in-memory metrics collector.
 * NO external dependencies (Prometheus, StatsD, etc.)
 */

import { Injectable, Logger } from '@nestjs/common';

export interface MetricsSnapshot {
  timestamp: string;
  events_consumed_total: number;
  events_failed_total: number;
  events_dlq_total: number;
  avg_processing_latency_ms: number;
  p95_processing_latency_ms: number;
  max_processing_latency_ms: number;
  last_event_consumed_at: string | null;
  uptime_seconds: number;
  success_rate: number;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly startTime = Date.now();

  // Counters
  private eventsConsumed = 0;
  private eventsFailed = 0;
  private eventsDlq = 0;

  // Latencies (keep last 1000 for percentiles)
  private latencies: number[] = [];
  private readonly maxLatencies = 1000;

  // Last event timestamp
  private lastEventAt: Date | null = null;

  recordEventConsumed(latencyMs: number): void {
    this.eventsConsumed++;
    this.latencies.push(latencyMs);

    // Keep only last N latencies
    if (this.latencies.length > this.maxLatencies) {
      this.latencies = this.latencies.slice(-this.maxLatencies);
    }

    this.lastEventAt = new Date();
  }

  recordEventFailed(): void {
    this.eventsFailed++;
  }

  recordEventDlq(): void {
    this.eventsDlq++;
  }

  getSnapshot(): MetricsSnapshot {
    // Calculate latency stats
    let avgLatency = 0;
    let p95Latency = 0;
    let maxLatency = 0;

    if (this.latencies.length > 0) {
      const sorted = [...this.latencies].sort((a, b) => a - b);
      avgLatency = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      const p95Idx = Math.floor(sorted.length * 0.95);
      p95Latency = sorted[p95Idx] || sorted[sorted.length - 1];
      maxLatency = sorted[sorted.length - 1];
    }

    const total = this.eventsConsumed + this.eventsFailed;
    const successRate = total > 0 ? (this.eventsConsumed / total) * 100 : 100;

    return {
      timestamp: new Date().toISOString(),
      events_consumed_total: this.eventsConsumed,
      events_failed_total: this.eventsFailed,
      events_dlq_total: this.eventsDlq,
      avg_processing_latency_ms: Math.round(avgLatency * 100) / 100,
      p95_processing_latency_ms: Math.round(p95Latency * 100) / 100,
      max_processing_latency_ms: Math.round(maxLatency * 100) / 100,
      last_event_consumed_at: this.lastEventAt?.toISOString() || null,
      uptime_seconds: Math.round((Date.now() - this.startTime) / 1000),
      success_rate: Math.round(successRate * 100) / 100,
    };
  }

  reset(): void {
    this.eventsConsumed = 0;
    this.eventsFailed = 0;
    this.eventsDlq = 0;
    this.latencies = [];
    this.lastEventAt = null;
  }
}
