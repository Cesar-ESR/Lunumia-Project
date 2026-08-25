import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import source from './index.html?raw'
import {
  APP_DESTINATIONS,
  APP_ORIGIN,
  LANDING_ORIGIN,
  renderLandingHtml,
} from './site-contract'

let landingDocument: Document
let styles: string

beforeAll(() => {
  styles = readFileSync(`${process.cwd()}/landing/styles.css`, 'utf8')
  landingDocument = new DOMParser().parseFromString(
    renderLandingHtml(source),
    'text/html',
  )
})

const landingText = () =>
  (landingDocument.body.textContent ?? '').replace(/\s+/g, ' ').trim()

describe('Lunumia Landing v1', () => {
  it('presenta un único H1 y landmarks semánticos completos', () => {
    const headings = landingDocument.querySelectorAll('h1')
    expect(headings).toHaveLength(1)
    expect(headings[0]?.textContent?.trim()).toBe(
      'Entiende tu dinero con más claridad.',
    )
    expect(landingDocument.querySelector('header nav')).not.toBeNull()
    expect(landingDocument.querySelector('main#contenido')).not.toBeNull()
    expect(
      landingDocument.querySelectorAll('main section').length,
    ).toBeGreaterThanOrEqual(7)
    expect(landingDocument.querySelector('footer nav')).not.toBeNull()
  })

  it('centraliza todos los destinos de aplicación en el origen canónico', () => {
    const links = [...landingDocument.querySelectorAll<HTMLAnchorElement>('a')]
    const openLinks = links.filter(({ textContent }) =>
      textContent?.trim().startsWith('Abrir Lunumia'),
    )
    const loginLinks = links.filter(
      ({ textContent }) => textContent?.trim() === 'Iniciar sesión',
    )
    const registerLinks = links.filter(
      ({ textContent }) => textContent?.trim() === 'Crear cuenta',
    )

    expect(openLinks.length).toBeGreaterThanOrEqual(3)
    expect(openLinks.every(({ href }) => href === APP_DESTINATIONS.open)).toBe(
      true,
    )
    expect(
      loginLinks.every(({ href }) => href === APP_DESTINATIONS.login),
    ).toBe(true)
    expect(
      registerLinks.every(({ href }) => href === APP_DESTINATIONS.register),
    ).toBe(true)
    expect(APP_DESTINATIONS.open.startsWith(`${APP_ORIGIN}/`)).toBe(true)
  })

  it('declara uso Web inmediato e instalación PWA opcional', () => {
    const text = landingText()
    expect(text).toMatch(/directamente en tu navegador/i)
    expect(text).toMatch(/instalar la PWA son opcionales/i)
    expect(text).toMatch(/sin instalar nada/i)
    expect(text).not.toMatch(/debes instalar|instalación obligatoria/i)
  })

  it('integra el logo horizontal oficial y favicons autocontenidos', () => {
    const logos = [
      ...landingDocument.querySelectorAll<HTMLImageElement>(
        'a.brand > img.brand-logo',
      ),
    ]
    expect(logos).toHaveLength(2)
    expect(logos.every(({ alt }) => alt === 'Lunumia')).toBe(true)
    expect(
      logos.every(({ src }) => src.endsWith('/lunumia-logo-horizontal.png')),
    ).toBe(true)
    expect(
      landingDocument.querySelector<HTMLLinkElement>(
        'link[rel="icon"][sizes="32x32"]',
      )?.href,
    ).toContain('/favicon-32x32.png')
    expect(
      landingDocument.querySelector<HTMLLinkElement>(
        'link[rel="apple-touch-icon"]',
      )?.href,
    ).toContain('/apple-touch-icon.png')
    const horizontalLogo = readFileSync(
      `${process.cwd()}/landing/public/lunumia-logo-horizontal.png`,
    )
    const favicon = readFileSync(
      `${process.cwd()}/landing/public/favicon-32x32.png`,
    )
    expect(horizontalLogo.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
    expect(favicon.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  })

  it('presenta plataformas equivalentes con iconos y estados informativos', () => {
    const platformSection = landingDocument.querySelector('.platform-section')
    const cards = [
      ...platformSection!.querySelectorAll<HTMLElement>('.platform-card'),
    ]

    expect(cards).toHaveLength(3)
    expect(cards[0]?.textContent).toContain('Web')
    expect(cards[0]?.textContent).toContain('Disponible ahora')
    expect(cards[1]?.textContent).toContain('PWA')
    expect(cards[1]?.textContent).toContain('Instalación opcional')
    expect(cards[2]?.textContent).toContain('Android')
    expect(cards[2]?.textContent).toContain('Próximamente')
    expect(cards[2]?.textContent).toContain('Lunumia en Android')
    expect(platformSection?.textContent).not.toContain('Cliente móvil separado')

    expect(
      platformSection
        ?.querySelector('svg[data-icon="globe-2"]')
        ?.getAttribute('aria-hidden'),
    ).toBe('true')
    expect(
      platformSection
        ?.querySelector('svg[data-icon="download"]')
        ?.getAttribute('aria-hidden'),
    ).toBe('true')
    expect(
      platformSection
        ?.querySelector('svg[data-icon="smartphone"]')
        ?.getAttribute('aria-hidden'),
    ).toBe('true')

    for (const card of cards) {
      expect(card.hasAttribute('role')).toBe(false)
      expect(card.hasAttribute('aria-selected')).toBe(false)
      expect(card.querySelector('a, button, input')).toBeNull()
    }
  })

  it('incluye metadata SEO canónica para marketing', () => {
    expect(landingDocument.title).toBe(
      'Lunumia — Entiende tu dinero con más claridad',
    )
    expect(
      landingDocument.querySelector<HTMLMetaElement>('meta[name="description"]')
        ?.content,
    ).toContain('organizar tus movimientos')
    expect(
      landingDocument.querySelector<HTMLLinkElement>('link[rel="canonical"]')
        ?.href,
    ).toBe(`${LANDING_ORIGIN}/`)
    expect(
      landingDocument.querySelector<HTMLMetaElement>('meta[property="og:url"]')
        ?.content,
    ).toBe(`${LANDING_ORIGIN}/`)
    expect(
      landingDocument.querySelector<HTMLMetaElement>('meta[name="robots"]')
        ?.content,
    ).toBe('index, follow')
  })

  it('mantiene todos los anchors internos resolubles', () => {
    const internalLinks = [
      ...landingDocument.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'),
    ]
    expect(internalLinks.length).toBeGreaterThan(0)
    for (const link of internalLinks) {
      expect(landingDocument.querySelector(link.hash)).not.toBeNull()
    }
  })

  it('expresa IA, OCR y local-first sin claims no demostrados', () => {
    const text = landingText()
    expect(text).toMatch(/explicaciones para comprender mejor tus datos/i)
    expect(text).toMatch(/revisa la información propuesta antes de guardarla/i)
    expect(text).toMatch(/comenzar como invitado/i)
    expect(text).toMatch(/procesan información remota sólo cuando solicitas/i)
    expect(text).not.toMatch(
      /asesor financiero|decisiones por ti|bank-level|military-grade|zero-knowledge|SOC 2|ISO 27001/i,
    )
  })

  it('no inventa precios, testimonios, métricas ni datos de clientes', () => {
    const text = landingText()
    expect(text).not.toMatch(
      /premium|plan pro|testimonio|10[,.]?000 usuarios|99\.9%|play store/i,
    )
    expect(text).toContain('Datos ilustrativos')
    expect(text).not.toMatch(/@|access_token|service_role/i)
  })

  it('mantiene una estructura responsive sin runtime pesado ni Service Worker', () => {
    expect(
      landingDocument.querySelector<HTMLMetaElement>('meta[name="viewport"]')
        ?.content,
    ).toContain('width=device-width')
    expect(styles).toMatch(
      /html,\s*body\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s,
    )
    expect(styles).not.toMatch(/body\s*\{[^}]*min-width:\s*320px/s)
    expect(styles).not.toMatch(/body\s*\{[^}]*overflow-x:\s*(?:hidden|clip)/s)
    expect(styles).toContain('@media (max-width: 860px)')
    expect(styles).toContain('@media (max-width: 600px)')
    expect(styles).toContain('@media (max-width: 380px)')
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
    expect(source).not.toMatch(/supabase|serviceWorker|registerSW/i)
    expect(landingDocument.querySelectorAll('script')).toHaveLength(1)
  })
})
