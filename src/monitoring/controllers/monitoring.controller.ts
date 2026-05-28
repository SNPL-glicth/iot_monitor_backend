import {
  Controller,
  Get,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { MonitoringService } from '../services/monitoring.service';
import { SensorQueryService } from '../services/sensor-query.service';
import { StateComputationService } from '../../domain/state-computation.service';

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly sensorQueryService: SensorQueryService,
    private readonly stateComputationService: StateComputationService,
  ) {}

  @Get('devices')
  @Roles('admin', 'operator', 'viewer')
  getDevicesWithSensors() {
    return this.sensorQueryService.getDevicesWithSensors();
  }

  @Get('devices/:id')
  @Roles('admin', 'operator', 'viewer')
  getDeviceById(@Param('id', ParseIntPipe) id: number) {
    return this.sensorQueryService.getDeviceById(id);
  }

  @Get('predictions')
  @Roles('admin', 'operator', 'viewer')
  getLatestPredictions() {
    return this.sensorQueryService.getLatestPredictions(50);
  }

  @Get('ml-health')
  @Roles('admin', 'operator', 'viewer')
  getMlHealth() {
    return this.sensorQueryService.getMlHealth();
  }

  @Delete('sensors/:sensorId')
  @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async deleteSensor(@Param('sensorId', ParseIntPipe) sensorId: number) {
    return this.sensorQueryService.deleteSensor(sensorId);
  }

  @Get('sensors/:sensorId/status')
  @Roles('admin', 'operator', 'viewer')
  getSensorConsolidatedStatus(@Param('sensorId', ParseIntPipe) sensorId: number) {
    return this.sensorQueryService.getSensorConsolidatedStatus(sensorId);
  }

  @Get('sensors/:sensorId/state')
  @Roles('admin', 'operator', 'viewer')
  async getSensorState(@Param('sensorId', ParseIntPipe) sensorId: number) {
    const sensorData = await this.sensorQueryService.getSensorConsolidatedStatus(sensorId);

    if (!sensorData) {
      return {
        state: 'UNKNOWN',
        severity: 'unknown',
        action_required: false,
        action: null,
        currentValue: null,
        thresholds: null,
      };
    }

    const currentValue = sensorData.latestValue ? Number(sensorData.latestValue) : null;
    const warningThreshold = sensorData.thresholds?.find((t: any) => t.severity === 'warning');
    const alertThreshold = sensorData.thresholds?.find((t: any) => t.severity === 'critical');

    const thresholds = {
      warningMin: warningThreshold?.thresholdValueMin ? Number(warningThreshold.thresholdValueMin) : null,
      warningMax: warningThreshold?.thresholdValueMax ? Number(warningThreshold.thresholdValueMax) : null,
      alertMin: alertThreshold?.thresholdValueMin ? Number(alertThreshold.thresholdValueMin) : null,
      alertMax: alertThreshold?.thresholdValueMax ? Number(alertThreshold.thresholdValueMax) : null,
    };

    const operationalState = this.stateComputationService.evaluateSensorOperationalState({
      currentValue,
      thresholds,
      hasActiveAlerts: sensorData.activeAlertsCount > 0,
      hasActiveWarnings: sensorData.warning_active !== null,
      predictionWouldBreach: false,
      operationalStateFromDb: sensorData.operational_state?.state,
      isStale: sensorData.final_state === 'stale',
    });

    let severity: 'critical' | 'warning' | 'info' | 'unknown' = 'info';
    if (operationalState === 'ALERT' || operationalState === 'CRITICAL') {
      severity = 'critical';
    } else if (operationalState === 'WARNING') {
      severity = 'warning';
    } else if (operationalState === 'STALE' || operationalState === 'UNKNOWN') {
      severity = 'unknown';
    }

    const actionRequired = this.stateComputationService.isActionRequired(operationalState, severity);
    const action = this.stateComputationService.recommendAction(operationalState, currentValue, thresholds);

    return {
      state: operationalState,
      severity,
      action_required: actionRequired,
      action,
      currentValue,
      thresholds,
    };
  }
}
