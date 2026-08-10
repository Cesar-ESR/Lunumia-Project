import type { Clock, IdGenerator } from '@application/services/IdGenerator'
import type { UserSettingsStore } from '@application/use-cases/periods/SetActivePeriod'
import { normalizeCategoryName } from '@domain/rules'
import type { ICategoryRepository } from '@domain/repositories'

const SYSTEM_CATEGORY_NAME = 'Sin categoría'

export class InitializeLocalOwner {
  constructor(
    private readonly ownerId: string,
    private readonly settings: UserSettingsStore,
    private readonly categories: ICategoryRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<void> {
    const now = this.clock.now()
    if (!(await this.settings.get())) {
      await this.settings.upsert({
        id: this.ids.generate(),
        ownerId: this.ownerId,
        activePeriodId: null,
        currency: 'MXN',
        theme: 'system',
        createdAt: now,
        updatedAt: now,
      })
    }

    if (
      !(await this.categories.findAll()).some((category) => category.isSystem)
    ) {
      await this.categories.create({
        id: this.ids.generate(),
        ownerId: this.ownerId,
        name: SYSTEM_CATEGORY_NAME,
        normalizedName: normalizeCategoryName(SYSTEM_CATEGORY_NAME),
        color: '#64748B',
        icon: 'inbox',
        isSystem: true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending',
      })
    }
  }
}
