import { App, type BackButtonListenerEvent } from '@capacitor/app'
import type { BackButtonAdapter } from './BackButtonAdapter'

interface CapacitorBackPort {
  addListener(
    eventName: 'backButton',
    listener: (event: BackButtonListenerEvent) => void,
  ): Promise<{ remove(): Promise<void> }>
  exitApp(): Promise<void>
}

export class CapacitorBackButtonAdapter implements BackButtonAdapter {
  constructor(private readonly app: CapacitorBackPort = App) {}

  async subscribe(
    listener: (event: BackButtonListenerEvent) => void,
  ): Promise<() => Promise<void>> {
    const handle = await this.app.addListener('backButton', listener)
    return () => handle.remove()
  }

  exitApp(): Promise<void> {
    return this.app.exitApp()
  }
}
