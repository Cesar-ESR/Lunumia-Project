import type { UserSettingsStore } from '@application/use-cases/periods/SetActivePeriod'

export class GetUserSettings {
  constructor(private readonly settings: UserSettingsStore) {}

  execute() {
    return this.settings.get()
  }
}
