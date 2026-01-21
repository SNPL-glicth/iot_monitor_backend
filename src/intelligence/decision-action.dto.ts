export class RecommendedActionDto {
  priority: number;
  action: string;
  timeframe: string;
}

export class DecisionActionDto {
  id: string;
  deviceId: string;
  deviceName: string;
  patternSignature: string;
  decisionType: string;
  priority: number;
  severity: string;
  title: string;
  summary: string;
  explanation: string | null;
  recommendedActions: RecommendedActionDto[];
  affectedSensorIds: number[];
  eventCount: number;
  status: string;
  shouldNotify: boolean;
  createdAt: string;
  expiresAt: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  ageMinutes: number;
}

export class DecisionActionListResponseDto {
  decisions: DecisionActionDto[];
  total: number;
}

export class UpdateDecisionStatusDto {
  status: 'acknowledged' | 'resolved';
}
