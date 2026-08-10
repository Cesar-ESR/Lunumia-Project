import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorState } from './ErrorState'
import { APP_NAME } from '@shared/constants'

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `Error de render en ${APP_NAME}`,
      error.name,
      info.componentStack,
    )
  }

  render() {
    if (this.state.hasError)
      return (
        <ErrorState message="La aplicación encontró un problema. Recarga la página para continuar." />
      )
    return this.props.children
  }
}
