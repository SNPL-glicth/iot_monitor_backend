export interface IMqttTopicFormatter {
  formatSensorReading(deviceId: string, sensorId: string): string;
  formatAlert(deviceId: string, severity: string): string;
  formatHeartbeat(deviceId: string): string;
}
