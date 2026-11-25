import { beforeAll, describe, expect, it } from 'vitest'
import source from './privacy/index.html?raw'
import { renderLandingHtml } from './site-contract'

let privacyDocument: Document

beforeAll(() => {
  privacyDocument = new DOMParser().parseFromString(
    renderLandingHtml(source),
    'text/html',
  )
})

describe('Landing Privacy Notice Page', () => {
  it('renderiza título accesible y fecha de actualización', () => {
    expect(privacyDocument.querySelector('h1')?.textContent).toContain(
      'Aviso de Privacidad Integral de Lunumia',
    )
    expect(privacyDocument.querySelector('.legal-date')?.textContent).toContain(
      '24 de noviembre de 2026',
    )
  })

  it('describe los tratamientos, opciones y derechos vinculados con el producto', () => {
    const content = privacyDocument.body.textContent ?? ''
    expect(content).toContain('modo invitado')
    expect(content).toContain('Supabase')
    expect(content).toContain('Groq')
    expect(content).toContain('La imagen comprimida')
    expect(content).toContain('derechos ARCO')
    expect(content).toContain('eliminación de cuenta')
  })

  it('no deja tokens de contrato sin resolver', () => {
    expect(privacyDocument.documentElement.outerHTML).not.toMatch(
      /{{[A-Z_]+}}/,
    )
  })
})
