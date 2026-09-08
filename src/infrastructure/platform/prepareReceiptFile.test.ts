import { prepareReceiptFile } from './prepareReceiptFile'
import { renderReceiptPdf } from './renderReceiptPdf'
import { MAX_RECEIPT_IMAGE_BYTES } from './validateReceiptImage'

vi.mock('./renderReceiptPdf', () => ({ renderReceiptPdf: vi.fn() }))

describe('prepareReceiptFile', () => {
  it.each(['image/jpeg', 'image/png'])(
    'preserva %s sin render PDF',
    async (type) => {
      const file = new File(['image'], 'receipt', { type })
      expect(await prepareReceiptFile(file)).toBe(file)
    },
  )
  it.each(['application/pdf', '', 'application/octet-stream'])(
    'detecta firma PDF con MIME %s',
    async (type) => {
      const rendered = new File(['image'], 'page.jpg', { type: 'image/jpeg' })
      vi.mocked(renderReceiptPdf).mockResolvedValue(rendered)
      const file = new File(['%PDF-synthetic'], 'receipt', { type })
      expect(await prepareReceiptFile(file)).toBe(rendered)
      expect(renderReceiptPdf).toHaveBeenCalledWith(file)
    },
  )
  it('rechaza PDF corrupto y extensión falsa', async () => {
    await expect(
      prepareReceiptFile(
        new File(['bad'], 'file.pdf', { type: 'application/pdf' }),
      ),
    ).rejects.toMatchObject({ code: 'pdf_invalid' })
    await expect(
      prepareReceiptFile(new File(['bad'], 'file.pdf')),
    ).rejects.toMatchObject({ code: 'unsupported_type' })
  })
  it('rechaza tamaño antes de leer bytes', async () => {
    const file = new File(['%PDF-'], 'large.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'size', { value: MAX_RECEIPT_IMAGE_BYTES })
    await expect(prepareReceiptFile(file)).rejects.toMatchObject({
      code: 'file_too_large',
    })
  })
})
