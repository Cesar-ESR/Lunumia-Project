import { CapacitorBackButtonAdapter } from './CapacitorBackButtonAdapter'

describe('CapacitorBackButtonAdapter', () => {
  it('encapsula Back y elimina el listener sin filtrar el plugin a Presentation', async () => {
    const remove = vi.fn(async () => undefined)
    const app = {
      addListener: vi.fn(async () => ({ remove })),
      exitApp: vi.fn(async () => undefined),
    }
    const adapter = new CapacitorBackButtonAdapter(app)
    const listener = vi.fn()
    const unsubscribe = await adapter.subscribe(listener)

    expect(app.addListener).toHaveBeenCalledWith('backButton', listener)
    await unsubscribe()
    expect(remove).toHaveBeenCalledOnce()

    await adapter.exitApp()
    expect(app.exitApp).toHaveBeenCalledOnce()
  })
})
