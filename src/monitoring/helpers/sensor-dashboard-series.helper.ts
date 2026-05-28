import { evaluateTelemetryState } from '../../common/sensor-states';

export function buildDashboardSeries(
  readings: { value: string | number; timestamp: Date }[],
  canonicalThresholds: {
    warning: { min: number | null; max: number | null; conditionType: string };
    alert: { min: number | null; max: number | null; conditionType: string };
  },
) {
  return readings.map((r, idx) => {
    const value = Number(r.value);
    const pointState = evaluateTelemetryState(value, {
      warningMin: canonicalThresholds.warning.min,
      warningMax: canonicalThresholds.warning.max,
      alertMin: canonicalThresholds.alert.min,
      alertMax: canonicalThresholds.alert.max,
      warningConditionType: canonicalThresholds.warning.conditionType,
      alertConditionType: canonicalThresholds.alert.conditionType,
    });

    let delta: number | null = null;
    if (idx > 0) {
      delta = value - Number(readings[idx - 1].value);
    }

    return {
      timestamp: r.timestamp.toISOString(),
      readingTimestamp: r.timestamp.toISOString(),
      value,
      state: pointState,
      delta,
      events: [] as string[],
    };
  });
}
