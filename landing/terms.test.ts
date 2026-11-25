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
    expect(date?.textContent).toContain('24 de noviembre de 2026')
  })

  it('contiene las 11 secciones de los términos', () => {
    const sections = termsDocument.querySelectorAll('.legal-section h2')
    expect(sections).toHaveLength(11)
    expect(sections[0]?.textContent).toContain('1. Servicio y alcance')
    expect(sections[10]?.textContent).toContain(
      '11. Ley aplicable y atención de controversias',
    )
  })

  it('aclara derechos del consumidor, pagos y eliminación de cuenta', () => {
    const content = termsDocument.body.textContent ?? ''
    expect(content).toContain(
      'No se realizará un cobro sin la aceptación expresa',
    )
    expect(content).toContain('PROFECO')
    expect(content).toContain('solicitar el cierre de su cuenta')
    expect(content).toContain('no excluye o limita responsabilidad')
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
