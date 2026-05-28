import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Servicio dedicado al mantenimiento de alertas y eventos ML.
 * SOLID-SRP: Una sola razón para cambiar — políticas de TTL y auto-resolución.
 */
@Injectable()
export class AlertMaintenanceService {
  private readonly logger = new Logger(AlertMaintenanceService.name);

  constructor(private readonly dataSource: DataSource) {}

  async runAlertMaintenance() {
    const results: {
      autoResolved: number;
      ttlCleaned: number;
      mlEventsCleaned: number;
      errors: string[];
    } = {
      autoResolved: 0,
      ttlCleaned: 0,
      mlEventsCleaned: 0,
      errors: [],
    };

    try {
      const r1 = await this.dataSource.query('EXEC sp_auto_resolve_alerts');
      results.autoResolved = r1?.[0]?.resolved_count ?? 0;
    } catch (e) {
      results.errors.push(`sp_auto_resolve_alerts: ${(e as Error).message}`);
    }

    try {
      const r2 = await this.dataSource.query(
        'EXEC sp_cleanup_stale_alerts @ttl_minutes = 60',
      );
      results.ttlCleaned = r2?.[0]?.cleaned_count ?? 0;
    } catch (e) {
      results.errors.push(`sp_cleanup_stale_alerts: ${(e as Error).message}`);
    }

    try {
      const r3 = await this.dataSource.query(
        'EXEC sp_cleanup_stale_ml_events @ttl_minutes = 30',
      );
      results.mlEventsCleaned = r3?.[0]?.cleaned_count ?? 0;
    } catch (e) {
      results.errors.push(
        `sp_cleanup_stale_ml_events: ${(e as Error).message}`,
      );
    }

    return {
      success: results.errors.length === 0,
      ...results,
      executedAt: new Date().toISOString(),
    };
  }
}
