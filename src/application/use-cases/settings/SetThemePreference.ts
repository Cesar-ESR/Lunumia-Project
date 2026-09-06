import type { Clock } from '@application/services/IdGenerator'
import type { UserSettingsStore } from '@application/use-cases/periods/SetActivePeriod'
import type { ThemePreference } from '@domain/entities'

export class SetThemePreference {
  constructor(
    private readonly settings: UserSettingsStore,
    private readonly clock: Clock,
  ) {}

  async execute(theme: ThemePreference) {
    const current = await this.settings.get()
    if (!current)
      throw new Error('La configuración local todavía no está disponible.')

    return this.settings.upsert({
      ...current,
      theme,
      updatedAt: this.clock.now(),
    })
  }
}
