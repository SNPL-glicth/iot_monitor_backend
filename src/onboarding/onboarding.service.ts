import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CreateSensorDto } from './dto/create-sensor.dto';
import { ProvisioningResponse } from './interfaces/provisioning-response.interface';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(private readonly httpService: HttpService) {}

  async provisionSensor(dto: CreateSensorDto): Promise<ProvisioningResponse> {
    const ingestUrl = process.env.INGEST_URL || 'http://localhost:8001/ingest/packets';
    const baseUrl = process.env.INGEST_BASE_URL || ingestUrl.split('/ingest/')[0] || 'http://localhost:8001';
    const url = `${baseUrl}/sensor-add`;

    const payload = {
      device_uuid: dto.deviceUuid,
      sensor_name: dto.sensorName,
      sensor_type: dto.sensorType,
      sampling_interval_ms: dto.samplingIntervalMs,
      unit: dto.unit,
      qos: dto.qos,
    };

    const apiKey = process.env.INGEST_INTERNAL_KEY || '';

    try {
      this.logger.log(`Forwarding provisioning request for device ${dto.deviceUuid} to ${url}`);
      
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            'X-Internal-API-Key': apiKey,
            'Content-Type': 'application/json',
          },
        }),
      );

      const data = response.data;

      const mappedResponse: ProvisioningResponse = {
        sensorUuid: data.sensor_uuid,
        sensorId: Number(data.sensor_id),
        mqttTopic: data.mqtt_topic,
        sensorApiKey: data.sensor_api_key,
        samplingIntervalMs: Number(data.sampling_interval_ms),
      };

      this.logger.log(
        `Successfully provisioned sensor sensorUuid=${mappedResponse.sensorUuid} sensorId=${mappedResponse.sensorId}`,
      );

      return mappedResponse;
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const message = error.response?.data?.detail || error.message || 'Error communicating with ingest service';
      
      this.logger.error(`Failed to provision sensor in FastAPI: ${message}`, error.stack);
      throw new HttpException(message, status);
    }
  }
}
