import { beforeAll, describe, expect, it } from 'vitest'
import source from './third-party-licenses/index.html?raw'
import { APP_DESTINATIONS, renderLandingHtml } from './site-contract'

let licensesDocument: Document

beforeAll(() => {
  licensesDocument = new DOMParser().parseFromString(
    renderLandingHtml(source),
    'text/html',
  )
})

describe('Landing Licenses Page', () => {
  it('renderiza título accesible, contenedor de búsqueda y lista', () => {
    const heading = licensesDocument.querySelector('h1')
    expect(heading?.textContent).toContain('Licencias de Código Abierto')

    const searchInput = licensesDocument.querySelector('#licenses-search')
    expect(searchInput).not.toBeNull()
    expect(searchInput?.getAttribute('type')).toBe('search')

    const list = licensesDocument.querySelector('#licenses-list')
    expect(list).not.toBeNull()
    expect(list?.getAttribute('role')).toBe('feed')
  })

  it('resuelve los tokens de contrato en enlaces a la app', () => {
    const loginLink = licensesDocument.querySelector(
      `a[href="${APP_DESTINATIONS.login}"]`,
    )
    expect(loginLink).not.toBeNull()

    const openLink = licensesDocument.querySelector(
      `a[href="${APP_DESTINATIONS.open}"]`,
    )
    expect(openLink).not.toBeNull()
  })

  it('incluye enlace al inicio y menú de apariencia accesible', () => {
    const brand = licensesDocument.querySelector('header a.brand')
    expect(brand?.getAttribute('href')).toBe('/')

    const menu = licensesDocument.querySelector('.appearance-menu')
    expect(menu).not.toBeNull()
  })
})
