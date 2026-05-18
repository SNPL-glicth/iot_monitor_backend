import { Injectable } from '@nestjs/common';
import { CrmDashboardService } from './crm-dashboard.service';
import { CrmAlertService } from './crm-alert.service';
import { CrmDeviceService } from './crm-device.service';

@Injectable()
export class CrmService {
  constructor(
    private readonly dashboard: CrmDashboardService,
    private readonly alerts: CrmAlertService,
    private readonly devices: CrmDeviceService,
  ) {}

  async listDevices(query: any, ctx: any) { return this.devices.listDevices(query, ctx); }
  async getDeviceProfile(deviceId: number, ctx: any) { return this.devices.getDeviceProfile(deviceId, ctx); }
  async getDeviceTimeline(deviceId: number, query: any, ctx: any) { return this.devices.getDeviceTimeline(deviceId, query, ctx); }
  async getDeviceHistory(deviceId: number, query: any, ctx: any) { return this.devices.getDeviceHistory(deviceId, query, ctx); }
  async getSensorSeries(sensorId: number, query: any, ctx: any) { return this.devices.getSensorSeries(sensorId, query, ctx); }
  async getDeviceProfileFull(deviceId: number, query: any, ctx: any) { return this.devices.getDeviceProfile(deviceId, ctx); }
  async listAlerts(query: any, ctx: any) { return this.alerts.listAlerts(query, ctx); }
  async acknowledgeAlert(alertId: number, ctx: any) { return this.alerts.acknowledgeAlert(alertId, ctx); }
  async resolveAlert(alertId: number, ctx: any) { return this.alerts.resolveAlert(alertId, ctx); }
  async getAlertSnapshot(alertId: number, ctx: any) { return this.alerts.getAlertSnapshot(alertId, ctx); }
  async getDashboard(query: any, ctx: any) { return this.dashboard.getDashboard(query, ctx); }
  async getMlEventsBadge(ctx: any) { return this.dashboard.getMlEventsBadge(ctx); }
  async listMlEvents(query: any, ctx: any) { return this.dashboard.listMlEvents(query, ctx); }
  invalidateBadgeCache() { this.dashboard.invalidateBadgeCache(); }
  invalidateDashboardCache() { this.dashboard.invalidateDashboardCache(); }
  invalidateAllCache() { this.dashboard.invalidateAllCache(); }
}
