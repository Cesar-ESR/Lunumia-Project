import type { BackButtonAdapter } from './BackButtonAdapter'

export class WebBackButtonAdapter implements BackButtonAdapter {
  async subscribe(): Promise<() => Promise<void>> {
    return async () => undefined
  }

  async exitApp(): Promise<void> {
    // The browser owns root-level Back behavior.
  }
}
