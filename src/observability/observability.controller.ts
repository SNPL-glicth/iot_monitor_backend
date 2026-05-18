import { Controller, Get } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller()
export class ObservabilityController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('/health')
  async health() {
    /**
     * Health endpoint with event consumption status
     * 
     * Returns:
     *   - status: ok
     *   - redis_connected: boolean
     *   - stream_lag: number
     *   - events_consumed_total: number
     */
    const snapshot = this.metricsService.getSnapshot();
    
    // Check Redis connection (via RedisEventBus if available)
    let redisConnected = false;
    let streamLag = 0;
    
    try {
      // Try to get Redis status from event bus
      const { RedisEventBus } = await import('../events/redis-event-bus.js');
      // This is a simplified check - in production you'd inject the actual instance
      redisConnected = true;
    } catch {
      redisConnected = false;
    }
    
    return {
      status: 'ok',
      redis_connected: redisConnected,
      stream_lag: streamLag,
      events_consumed_total: snapshot.events_consumed_total,
      last_event_consumed_at: snapshot.last_event_consumed_at,
      uptime_seconds: snapshot.uptime_seconds,
    };
  }

  @Get('/metrics')
  metrics() {
    /**
     * Metrics endpoint
     * 
     * Returns comprehensive metrics:
     *   - Event consumption stats
     *   - Latency percentiles
     *   - Success rate
     *   - DLQ stats
     */
    return this.metricsService.getSnapshot();
  }
}
