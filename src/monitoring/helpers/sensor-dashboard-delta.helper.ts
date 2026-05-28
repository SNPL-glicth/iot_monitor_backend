import { DataSource } from 'typeorm';

export async function getDeltaThresholdForSensor(
  dataSource: DataSource,
  sensorId: number,
): Promise<number | null> {
  try {
    const result = await dataSource.query(
      `SELECT TOP 1 abs_delta FROM dbo.delta_thresholds WHERE sensor_id = @0 AND is_active = 1 ORDER BY id ASC`,
      [sensorId],
    );
    if (result && result.length > 0 && result[0].abs_delta !== null) {
      return Number(result[0].abs_delta);
    }
    return null;
  } catch {
    return null;
  }
}
