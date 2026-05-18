/**
 * Threshold Evaluation Domain Service
 * 
 * PHASE 2: Extract business logic from Stored Procedures
 * 
 * WHY THIS EXISTS:
 * - Business logic belongs in application layer, NOT database
 * - Enables testing without database
 * - Supports multiple storage backends
 * - Follows Clean Architecture principles
 * 
 * EXTRACTED FROM: sp_insert_reading_and_check_threshold
 */

export interface ThresholdConfig {
  id: string;
  sensorId: string;
  conditionType: 'greater_than' | 'less_than' | 'equal_to' | 'out_of_range';
  thresholdValueMin: number | null;
  thresholdValueMax: number | null;
  severity: 'info' | 'warning' | 'critical';
  isActive: boolean;
}

export interface DeltaThresholdConfig {
  id: string;
  sensorId: string;
  absDelta: number | null;
  relDelta: number | null;
  absSlope: number | null;
  relSlope: number | null;
  severity: 'info' | 'warning' | 'critical';
  isActive: boolean;
}

export interface Reading {
  sensorId: string;
  value: number;
  timestamp: Date;
  deviceTimestamp?: Date;
}

export interface PreviousReading {
  value: number;
  timestamp: Date;
}

export interface ThresholdViolation {
  type: 'threshold' | 'delta';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata: Record<string, any>;
}

/**
 * Threshold Evaluation Service
 * 
 * Pure domain logic - no database dependencies
 */
export class ThresholdEvaluationService {
  /**
   * Evaluate if reading violates threshold
   * 
   * PURE FUNCTION: No side effects
   */
  evaluateThreshold(
    reading: Reading,
    threshold: ThresholdConfig,
  ): ThresholdViolation | null {
    if (!threshold.isActive) {
      return null;
    }

    const { value } = reading;
    const { conditionType, thresholdValueMin, thresholdValueMax, severity } = threshold;

    let violated = false;
    let message = '';

    switch (conditionType) {
      case 'greater_than':
        if (thresholdValueMin !== null && value > thresholdValueMin) {
          violated = true;
          message = `Value ${value} exceeds threshold ${thresholdValueMin}`;
        }
        break;

      case 'less_than':
        if (thresholdValueMin !== null && value < thresholdValueMin) {
          violated = true;
          message = `Value ${value} below threshold ${thresholdValueMin}`;
        }
        break;

      case 'equal_to':
        if (thresholdValueMin !== null && value === thresholdValueMin) {
          violated = true;
          message = `Value ${value} equals threshold ${thresholdValueMin}`;
        }
        break;

      case 'out_of_range':
        if (
          (thresholdValueMin !== null && value < thresholdValueMin) ||
          (thresholdValueMax !== null && value > thresholdValueMax)
        ) {
          violated = true;
          message = `Value ${value} outside range [${thresholdValueMin}, ${thresholdValueMax}]`;
        }
        break;
    }

    if (!violated) {
      return null;
    }

    return {
      type: 'threshold',
      severity,
      message,
      metadata: {
        value,
        conditionType,
        thresholdValueMin,
        thresholdValueMax,
      },
    };
  }

  /**
   * Evaluate delta spike detection
   * 
   * PURE FUNCTION: No side effects
   * 
   * Detects:
   * - Absolute delta (value change)
   * - Relative delta (% change)
   * - Absolute slope (rate of change)
   * - Relative slope (% rate of change)
   */
  evaluateDeltaSpike(
    currentReading: Reading,
    previousReading: PreviousReading,
    deltaThreshold: DeltaThresholdConfig,
  ): ThresholdViolation | null {
    if (!deltaThreshold.isActive) {
      return null;
    }

    const { value: currentValue, timestamp: currentTs } = currentReading;
    const { value: prevValue, timestamp: prevTs } = previousReading;

    // Calculate deltas
    const deltaAbs = Math.abs(currentValue - prevValue);
    
    // Relative delta with epsilon to avoid division by zero
    const epsilon = 0.000001;
    const deltaRel = deltaAbs / Math.max(Math.abs(prevValue), epsilon);

    // Calculate time difference in seconds
    const dtSeconds = (currentTs.getTime() - prevTs.getTime()) / 1000;

    if (dtSeconds <= 0) {
      return null; // Invalid time sequence
    }

    // Calculate slopes (rate of change)
    const slopeAbs = deltaAbs / dtSeconds;
    const slopeRel = deltaRel / dtSeconds;

    // Check thresholds
    let violated = false;
    const violations: string[] = [];

    if (deltaThreshold.absDelta !== null && deltaAbs >= deltaThreshold.absDelta) {
      violated = true;
      violations.push(`abs_delta=${deltaAbs.toFixed(5)} >= ${deltaThreshold.absDelta}`);
    }

    if (deltaThreshold.relDelta !== null && deltaRel >= deltaThreshold.relDelta) {
      violated = true;
      violations.push(`rel_delta=${deltaRel.toFixed(5)} >= ${deltaThreshold.relDelta}`);
    }

    if (deltaThreshold.absSlope !== null && slopeAbs >= deltaThreshold.absSlope) {
      violated = true;
      violations.push(`abs_slope=${slopeAbs.toFixed(5)} >= ${deltaThreshold.absSlope}`);
    }

    if (deltaThreshold.relSlope !== null && slopeRel >= deltaThreshold.relSlope) {
      violated = true;
      violations.push(`rel_slope=${slopeRel.toFixed(5)} >= ${deltaThreshold.relSlope}`);
    }

    if (!violated) {
      return null;
    }

    const message = `Delta spike detected: ${violations.join('; ')}`;

    return {
      type: 'delta',
      severity: deltaThreshold.severity,
      message,
      metadata: {
        deltaAbs,
        deltaRel,
        slopeAbs,
        slopeRel,
        dtSeconds,
        prevValue,
        currentValue,
        violations,
      },
    };
  }

  /**
   * Evaluate all thresholds for a reading
   * 
   * Returns all violations found
   */
  evaluateAll(
    reading: Reading,
    previousReading: PreviousReading | null,
    thresholds: ThresholdConfig[],
    deltaThresholds: DeltaThresholdConfig[],
  ): ThresholdViolation[] {
    const violations: ThresholdViolation[] = [];

    // Evaluate static thresholds
    for (const threshold of thresholds) {
      const violation = this.evaluateThreshold(reading, threshold);
      if (violation) {
        violations.push(violation);
      }
    }

    // Evaluate delta thresholds (requires previous reading)
    if (previousReading) {
      for (const deltaThreshold of deltaThresholds) {
        const violation = this.evaluateDeltaSpike(
          reading,
          previousReading,
          deltaThreshold,
        );
        if (violation) {
          violations.push(violation);
        }
      }
    }

    return violations;
  }
}
