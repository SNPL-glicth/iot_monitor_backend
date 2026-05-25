export interface ProvisioningResponse {
  sensorUuid: string;
  sensorId: number;
  mqttTopic: string;
  sensorApiKey: string;
  samplingIntervalMs: number;
}
