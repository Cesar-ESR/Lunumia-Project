import type { CapturedImage } from '@infrastructure/platform'

export function ReceiptPreview({
  image,
  isRecognizing = false,
  isSelecting = false,
  readonly = false,
  canAnalyze,
  onAnalyze,
  onReplace,
  onManual,
  onCancel,
}: {
  image: CapturedImage
  isRecognizing?: boolean
  isSelecting?: boolean
  readonly?: boolean
  canAnalyze?: boolean
  onAnalyze?(): void
  onReplace?(): void
  onManual?(): void
  onCancel?(): void
}) {
  return (
    <section
      className="panel receipt-preview"
      aria-labelledby="receipt-preview-title"
    >
      <div>
        <p className="eyebrow">Vista previa</p>
        <h2 id="receipt-preview-title">Imagen del recibo</h2>
      </div>
      <div className="receipt-image-frame">
        <img
          src={image.previewUrl}
          alt="Vista previa del recibo seleccionado"
        />
      </div>
      <p className="receipt-image-meta">
        {image.compressedWidth} × {image.compressedHeight} px ·{' '}
        {image.mimeType === 'image/jpeg' ? 'JPEG' : 'PNG'}
      </p>
      {isRecognizing ? (
        <div
          className="receipt-recognition-status"
          role="status"
          aria-live="polite"
        >
          <span className="spinner" aria-hidden="true" />
          <div>
            <strong>Analizando recibo…</strong>
            <span>Esto puede tomar unos segundos.</span>
          </div>
        </div>
      ) : null}
      {isSelecting ? (
        <p className="receipt-inline-status" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          Preparando otra imagen…
        </p>
      ) : null}
      {!readonly ? (
        <div className="receipt-preview-actions">
          <button
            className="button"
            disabled={isRecognizing || isSelecting || !canAnalyze}
            onClick={onAnalyze}
          >
            Analizar recibo
          </button>
          <button
            className="button secondary"
            disabled={isSelecting}
            onClick={onReplace}
          >
            Elegir otra imagen
          </button>
          <button
            className="button ghost"
            disabled={isSelecting}
            onClick={onManual}
          >
            Registrar manualmente
          </button>
          <button
            className="button ghost"
            disabled={isSelecting}
            onClick={onCancel}
          >
            Cancelar
          </button>
        </div>
      ) : null}
    </section>
  )
}
