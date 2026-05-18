/**
 * Event Bus Interface
 * 
 * PHASE 3: Event-Driven Architecture
 * 
 * ABSTRACTION:
 * - Decouples from specific implementation (Redis, RabbitMQ, Kafka)
 * - Enables testing with in-memory bus
 * - Supports multiple backends
 */

import { DomainEvent } from './domain-event';

export interface EventHandler<T extends DomainEvent = DomainEvent> {
  handle(event: T): Promise<void>;
}

export interface EventBus {
  /**
   * Publish event to bus
   * 
   * CRITICAL: Never throws - logs errors instead
   * Returns false if publish failed
   */
  publish(event: DomainEvent): Promise<boolean>;

  /**
   * Publish multiple events atomically
   * 
   * Either all succeed or all fail
   */
  publishBatch(events: DomainEvent[]): Promise<boolean>;

  /**
   * Subscribe to event type
   * 
   * Returns unsubscribe function
   */
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>,
  ): () => void;

  /**
   * Get event bus metrics
   */
  getMetrics(): EventBusMetrics;
}

export interface EventBusMetrics {
  totalPublished: number;
  totalFailed: number;
  totalSubscribers: number;
  publishRate: number; // events/sec
  errorRate: number;
}
