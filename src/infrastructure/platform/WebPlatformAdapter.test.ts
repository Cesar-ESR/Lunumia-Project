import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReceiptImageError } from './ReceiptImageError'
import { WebPlatformAdapter } from './WebPlatformAdapter'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document
    .querySelectorAll('input[type="file"]')
    .forEach((input) => input.remove())
})

describe('WebPlatformAdapter', () => {
  it('cancelar devuelve null y elimina el input temporal', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      this.dispatchEvent(new Event('cancel'))
    })
    await expect(new WebPlatformAdapter().takePhoto()).resolves.toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('cámara usa capture=environment y selección simple', async () => {
    const image = new File(['jpeg'], 'receipt.jpg', { type: 'image/jpeg' })
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      expect(this.accept).toBe('image/jpeg,image/png')
      expect(this.multiple).toBe(false)
      expect(this.getAttribute('capture')).toBe('environment')
      Object.defineProperty(this, 'files', {
        configurable: true,
        value: { length: 1, item: () => image },
      })
      this.dispatchEvent(new Event('change'))
    })
    await expect(new WebPlatformAdapter().takePhoto()).resolves.toMatchObject({
      file: image,
      mimeType: 'image/jpeg',
    })
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('galería omite capture y vuelve a validar el MIME del File', async () => {
    const image = new File(['webp'], 'receipt.jpg', { type: 'image/webp' })
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      expect(this.hasAttribute('capture')).toBe(false)
      Object.defineProperty(this, 'files', {
        configurable: true,
        value: { length: 1, item: () => image },
      })
      this.dispatchEvent(new Event('change'))
    })
    await expect(new WebPlatformAdapter().pickFromGallery()).rejects.toEqual(
      expect.objectContaining<Partial<ReceiptImageError>>({
        code: 'unsupported_type',
      }),
    )
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('el foco posterior a cancelar resuelve null y limpia listeners/timer', async () => {
    vi.useFakeTimers()
    const remove = vi.spyOn(window, 'removeEventListener')
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {
      window.dispatchEvent(new Event('focus'))
    })
    const pending = new WebPlatformAdapter().pickFromGallery()
    await vi.runAllTimersAsync()
    await expect(pending).resolves.toBeNull()
    expect(remove).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
    expect(document.querySelector('input[type="file"]')).toBeNull()
    vi.useRealTimers()
  })

  it('dos invocaciones secuenciales usan inputs nuevos sin residuos', async () => {
    const seen = new Set<HTMLInputElement>()
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      seen.add(this)
      this.dispatchEvent(new Event('cancel'))
    })
    const adapter = new WebPlatformAdapter()
    await adapter.takePhoto()
    await adapter.pickFromGallery()
    expect(seen.size).toBe(2)
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(0)
  })

  it('traduce un fallo al abrir el selector a read_failed y limpia el DOM', async () => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {
      throw new Error('internal browser detail')
    })
    await expect(new WebPlatformAdapter().takePhoto()).rejects.toMatchObject({
      code: 'read_failed',
      message: 'No se pudo leer la imagen. Intenta con otro archivo.',
    })
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })
})
