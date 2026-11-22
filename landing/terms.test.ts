import { beforeAll, describe, expect, it } from 'vitest'
import source from './terms/index.html?raw'
import { APP_DESTINATIONS, renderLandingHtml } from './site-contract'

let termsDocument: Document

beforeAll(() => {
  termsDocument = new DOMParser().parseFromString(
    renderLandingHtml(source),
    'text/html',
  )
})

describe('Landing Terms Page', () => {
  it('renderiza título accesible y fecha de actualización', () => {
    const heading = termsDocument.querySelector('h1')
    expect(heading?.textContent).toContain('Términos y Condiciones de Uso')

    const date = termsDocument.querySelector('.legal-date')
    expect(date?.textContent).toContain('16 de noviembre de 2026')
  })

  it('contiene las 10 secciones estipuladas', () => {
    const sections = termsDocument.querySelectorAll('.legal-section h2')
    expect(sections).toHaveLength(10)
    expect(sections[0]?.textContent).toContain(
      '1. Objeto y Descripción del Servicio',
    )
    expect(sections[9]?.textContent).toContain(
      '10. Legislación Aplicable y Jurisdicción',
    )
  })

  it('resuelve los tokens de contrato en enlaces a la app', () => {
    const loginLink = termsDocument.querySelector(
      `a[href="${APP_DESTINATIONS.login}"]`,
    )
    expect(loginLink).not.toBeNull()

    const openLink = termsDocument.querySelector(
      `a[href="${APP_DESTINATIONS.open}"]`,
    )
    expect(openLink).not.toBeNull()
  })

  it('incluye enlace al inicio y menú de apariencia accesible', () => {
    const brand = termsDocument.querySelector('header a.brand')
    expect(brand?.getAttribute('href')).toBe('/')

    const menu = termsDocument.querySelector('.appearance-menu')
    expect(menu).not.toBeNull()
  })
})
