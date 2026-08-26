import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { APP_NAME } from '@shared/constants'
import { LunumiaBrandSymbol } from '../../components/LunumiaBrandSymbol'

export function AuthPageLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link className="auth-brand" to="/inicio">
          <LunumiaBrandSymbol />
          <strong>{APP_NAME}</strong>
        </Link>
        <header>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        {children}
        {footer ? <footer>{footer}</footer> : null}
      </section>
    </main>
  )
}
