import type { IIncomeRepository } from '@domain/repositories'
export class DeleteIncome {
  constructor(private readonly incomes: IIncomeRepository) {}
  async execute(id: string) {
    if (!(await this.incomes.findById(id)))
      throw new Error('El ingreso no existe.')
    await this.incomes.delete(id)
  }
}
