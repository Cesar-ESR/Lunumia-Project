import { describe, expect, it, vi } from 'vitest'
import { receiptFileFixtures } from '../../tests/receipt/receipt-test-fixtures'
import { ReceiptImageError } from './ReceiptImageError'
import { validateReceiptImage } from './validateReceiptImage'

describe('validateReceiptImage', () => {
  it('acepta JPEG válido', () => {
    expect(validateReceiptImage(receiptFileFixtures.jpeg())).toBe('image/jpeg')
  })

  it('acepta PNG válido', () => {
    expect(validateReceiptImage(receiptFileFixtures.png())).toBe('image/png')
  })

  it.each(['image/webp', 'image/heic', 'application/pdf'])(
    'rechaza %s sin confiar en la extensión .jpg',
    (mimeType) => {
      const invalid = receiptFileFixtures.invalidMime(mimeType)
      expect(() => validateReceiptImage(invalid)).toThrowError(
        expect.objectContaining<Partial<ReceiptImageError>>({
          code: 'unsupported_type',
          message: 'Selecciona una imagen JPEG o PNG.',
        }),
      )
    },
  )

  it('acepta límite - 1 byte y rechaza límite exacto y + 1', () => {
    expect(validateReceiptImage(receiptFileFixtures.belowLimit())).toBe(
      'image/jpeg',
    )
    expect(() =>
      validateReceiptImage(receiptFileFixtures.atLimit()),
    ).toThrowError(
      expect.objectContaining<Partial<ReceiptImageError>>({
        code: 'file_too_large',
      }),
    )
    expect(() =>
      validateReceiptImage(receiptFileFixtures.aboveLimit()),
    ).toThrowError(
      expect.objectContaining<Partial<ReceiptImageError>>({
        code: 'file_too_large',
      }),
    )
  })

  it('rechaza archivos vacíos', () => {
    expect(() =>
      validateReceiptImage(receiptFileFixtures.empty()),
    ).toThrowError(
      expect.objectContaining<Partial<ReceiptImageError>>({
        code: 'empty_file',
      }),
    )
  })

  it('no persiste ni registra el archivo durante la validación', () => {
    const image = receiptFileFixtures.jpeg()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    expect(validateReceiptImage(image)).toBe('image/jpeg')
    expect(setItem).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
