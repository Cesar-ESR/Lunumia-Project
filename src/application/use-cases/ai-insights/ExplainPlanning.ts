import {
  buildPlanningAnalysisRequest,
  requireCompletePlanningAnalysisRequest,
} from '@application/contracts'
import type { FinancialSnapshot } from '@domain/calculations'
import type {
  AIInsightsProvider,
  PlanningAnalysisResponse,
} from '@domain/ports'

export class ExplainPlanning {
  constructor(private readonly provider: AIInsightsProvider) {}

  async execute(
    snapshot: FinancialSnapshot,
  ): Promise<PlanningAnalysisResponse> {
    const request = requireCompletePlanningAnalysisRequest(
      buildPlanningAnalysisRequest(snapshot),
    )
    return await this.provider.analyzePlanning(request)
  }
}
