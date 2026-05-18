/**
 * Idempotency Service
 * 
 * PHASE 4: Persistent idempotency using SQL Server
 * 
 * Prevents duplicate event processing across:
 * - Application restarts
 * - Multiple consumer instances
 * - Network retries
 */

import { Injectable, Logger } from '@nestjs/common';
import * as sql from 'mssql';

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private pool: sql.ConnectionPool | null = null;

  constructor() {
    this.initializePool();
  }

  /**
   * Initialize SQL Server connection pool
   */
  private async initializePool(): Promise<void> {
    try {
      const config: sql.config = {
        server: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '1434', 10),
        database: process.env.DB_NAME || 'iot_monitoring_system',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        options: {
          encrypt: process.env.DB_ENCRYPT === 'true',
          trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
          enableArithAbort: true,
        },
        pool: {
          max: 10,
          min: 2,
          idleTimeoutMillis: 30000,
        },
      };

      this.pool = await sql.connect(config);
      this.logger.log('SQL Server connection pool initialized');
    } catch (error: any) {
      this.logger.error(`Failed to initialize SQL pool: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if event was already processed (atomic)
   * 
   * Returns:
   *   - true: Event is NEW, proceed with processing
   *   - false: Event is DUPLICATE, skip processing
   * 
   * CRITICAL: This is atomic via PK constraint
   */
  async tryProcessEvent(
    eventId: string,
    consumerId: string,
    eventType?: string,
  ): Promise<boolean> {
    if (!this.pool) {
      this.logger.warn('SQL pool not initialized, allowing event');
      return true; // Fail open
    }

    try {
      const request = this.pool.request();
      request.input('event_id', sql.NVarChar(64), eventId);
      request.input('consumer_id', sql.NVarChar(100), consumerId);
      request.input('event_type', sql.NVarChar(50), eventType || null);
      request.output('is_duplicate', sql.Bit);

      await request.execute('sp_try_process_event');

      const isDuplicate = request.parameters.is_duplicate.value;

      if (isDuplicate) {
        this.logger.debug(
          `Duplicate event detected: ${eventId.substring(0, 10)}...`,
        );
        return false; // Skip processing
      }

      return true; // Process event
    } catch (error: any) {
      this.logger.error(
        `Idempotency check failed for ${eventId}: ${error.message}`,
      );
      // Fail open: Allow processing on error
      return true;
    }
  }

  /**
   * Check if event exists (read-only check)
   */
  async isEventProcessed(eventId: string): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    try {
      const result = await this.pool
        .request()
        .input('event_id', sql.NVarChar(64), eventId)
        .query(
          'SELECT 1 FROM dbo.processed_events WHERE event_id = @event_id',
        );

      return result.recordset.length > 0;
    } catch (error: any) {
      this.logger.error(`Failed to check event: ${error.message}`);
      return false;
    }
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    total_processed: number;
    oldest_event: string | null;
    newest_event: string | null;
  }> {
    if (!this.pool) {
      return { total_processed: 0, oldest_event: null, newest_event: null };
    }

    try {
      const result = await this.pool.request().query(`
        SELECT 
          COUNT(*) as total_processed,
          MIN(processed_at) as oldest_event,
          MAX(processed_at) as newest_event
        FROM dbo.processed_events
      `);

      const row = result.recordset[0];
      return {
        total_processed: row.total_processed,
        oldest_event: row.oldest_event?.toISOString() || null,
        newest_event: row.newest_event?.toISOString() || null,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get stats: ${error.message}`);
      return { total_processed: 0, oldest_event: null, newest_event: null };
    }
  }

  /**
   * Cleanup old processed events (maintenance)
   */
  async cleanupOldEvents(retentionDays: number = 30): Promise<number> {
    if (!this.pool) {
      return 0;
    }

    try {
      const result = await this.pool
        .request()
        .input('retention_days', sql.Int, retentionDays)
        .execute('sp_cleanup_old_processed_events');

      this.logger.log(`Cleaned up old processed events (retention: ${retentionDays} days)`);
      return 0;
    } catch (error: any) {
      this.logger.error(`Cleanup failed: ${error.message}`);
      return 0;
    }
  }

  /**
   * Close connection pool
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      this.logger.log('SQL Server connection pool closed');
    }
  }
}
