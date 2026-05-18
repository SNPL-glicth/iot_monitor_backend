import { Injectable } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service';
import { DecisionActionListResponseDto, DecisionActionDto } from './decision-action.dto';

@Injectable()
export class IntelligenceDecisionService {
  constructor(private readonly intelligence: IntelligenceService) {}

  async listDecisions(limit = 50, status?: string, severity?: string): Promise<DecisionActionListResponseDto> {
    return this.intelligence.listDecisions(limit, status, severity);
  }

  async updateDecisionStatus(decisionId: string, status: 'acknowledged' | 'resolved'): Promise<DecisionActionDto | null> {
    return this.intelligence.updateDecisionStatus(decisionId, status);
  }
}
