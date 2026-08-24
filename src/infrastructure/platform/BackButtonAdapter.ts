export interface BackButtonEvent {
  canGoBack: boolean
}

export interface BackButtonAdapter {
  subscribe(
    listener: (event: BackButtonEvent) => void,
  ): Promise<() => Promise<void>>
  exitApp(): Promise<void>
}
