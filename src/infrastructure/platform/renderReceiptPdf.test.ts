import { getDocument } from 'pdfjs-dist'
import { renderReceiptPdf } from './renderReceiptPdf'

vi.mock('pdfjs-dist', () => ({ getDocument: vi.fn(), GlobalWorkerOptions: {} }))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({
  default: '/worker.mjs',
}))

function file() {
  const input = new File(['%PDF-'], 'synthetic.pdf', {
    type: 'application/pdf',
  })
  Object.defineProperty(input, 'arrayBuffer', {
    value: async () => new ArrayBuffer(5),
  })
  return input
}

afterEach(() => vi.restoreAllMocks())

describe('renderReceiptPdf', () => {
  it('renderiza una sola página, limita resolución y libera recursos', async () => {
    const render = vi
      .fn<(options: unknown) => { promise: Promise<void> }>()
      .mockReturnValue({
        promise: Promise.resolve(),
      })
    const destroy = vi.fn().mockResolvedValue(undefined)
    const getPage = vi.fn().mockResolvedValue({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 900 * scale,
      }),
      render,
    })
    vi.mocked(getDocument).mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage }),
      destroy,
    } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
    )
    const result = await renderReceiptPdf(file())
    expect(result.type).toBe('image/jpeg')
    expect(getPage).toHaveBeenCalledExactlyOnceWith(1)
    expect(render.mock.calls[0]?.[0]).toMatchObject({
      viewport: { height: 1920 },
    })
    expect(destroy).toHaveBeenCalledOnce()
  })
  it('rechaza multipágina antes de renderizar', async () => {
    const getPage = vi.fn()
    const destroy = vi.fn()
    vi.mocked(getDocument).mockReturnValue({
      promise: Promise.resolve({ numPages: 2, getPage }),
      destroy,
    } as never)
    await expect(renderReceiptPdf(file())).rejects.toMatchObject({
      code: 'pdf_page_limit',
    })
    expect(getPage).not.toHaveBeenCalled()
    expect(destroy).toHaveBeenCalledOnce()
  })
  it.each([
    ['PasswordException', 'pdf_protected'],
    ['InvalidPDFException', 'pdf_invalid'],
  ])('traduce %s sin filtrar contenido', async (name, code) => {
    const error = new Error('private document content')
    error.name = name
    vi.mocked(getDocument).mockReturnValue({
      promise: Promise.reject(error),
      destroy: vi.fn(),
    } as never)
    await expect(renderReceiptPdf(file())).rejects.toMatchObject({ code })
  })
})
