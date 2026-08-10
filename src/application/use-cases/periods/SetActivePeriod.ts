import type { IPeriodRepository } from '@domain/repositories'
import type { UserSettings } from '@domain/entities'
import type { Clock } from '@application/services/IdGenerator'
export interface UserSettingsStore {
  get(): Promise<UserSettings | null>
  upsert(value: UserSettings): Promise<UserSettings>
}
export class SetActivePeriod {
  constructor(
    private readonly periods: IPeriodRepository,
    private readonly settings: UserSettingsStore,
    private readonly clock: Clock,
  ) {}
  async execute(periodId: string) {
    const period = await this.periods.findById(periodId)
    if (!period) throw new Error('El periodo no existe.')
    const current = await this.settings.get()
    if (!current || current.ownerId !== period.ownerId)
      throw new Error('La configuración no pertenece al propietario.')
    return this.settings.upsert({
      ...current,
      activePeriodId: periodId,
      updatedAt: this.clock.now(),
    })
  }
}
