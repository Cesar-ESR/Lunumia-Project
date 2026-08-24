import type { CapturedImage } from '@infrastructure/platform'
import { Button } from '../../components/Button'
import { LoadingState } from '../../components/LoadingState'
import { Surface } from '../../components/Surface'

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
    <Surface
      className="ln-receipt-preview"
      aria-labelledby="receipt-preview-title"
    >
      <div>
        <p className="eyebrow">Vista previa</p>
        <h2 id="receipt-preview-title">Imagen del recibo</h2>
      </div>
      <div className="ln-receipt-image-frame">
        <img
          src={image.previewUrl}
          alt="Vista previa del recibo seleccionado"
        />
      </div>
      <p className="ln-receipt-image-meta">
        {image.compressedWidth} × {image.compressedHeight} px ·{' '}
        {image.mimeType === 'image/jpeg' ? 'JPEG' : 'PNG'}
      </p>
      {isRecognizing ? (
        <LoadingState message="Analizando recibo… Esto puede tomar unos segundos." />
      ) : null}
      {isSelecting ? <LoadingState message="Preparando otra imagen…" /> : null}
      {!readonly ? (
        <div className="ln-receipt-actions">
          <Button
            disabled={isRecognizing || isSelecting || !canAnalyze}
            onClick={onAnalyze}
          >
            Analizar recibo
          </Button>
          <Button
            variant="secondary"
            disabled={isSelecting}
            onClick={onReplace}
          >
            Elegir otra imagen
          </Button>
          <Button variant="ghost" disabled={isSelecting} onClick={onManual}>
            Registrar manualmente
          </Button>
          <Button variant="ghost" disabled={isSelecting} onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      ) : null}
    </Surface>
  )
}
