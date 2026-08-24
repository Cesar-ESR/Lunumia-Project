export function ReceiptSourceSelector({
  isSelecting,
  onCamera,
  onGallery,
  onManual,
  onCancel,
}: {
  isSelecting: boolean
  onCamera(): void
  onGallery(): void
  onManual(): void
  onCancel(): void
}) {
  return (
    <Surface
      className="ln-receipt-source"
      aria-labelledby="receipt-source-title"
    >
      <div>
        <p className="eyebrow">Elige una opción</p>
        <h2 id="receipt-source-title">¿Cómo quieres registrar el gasto?</h2>
        <p>
          Puedes fotografiar el recibo, elegir una imagen existente o capturar
          los datos manualmente.
        </p>
      </div>
      {isSelecting ? <LoadingState message="Preparando imagen…" /> : null}
      <div className="ln-receipt-actions">
        <Button disabled={isSelecting} onClick={onCamera}>
          Tomar foto
        </Button>
        <Button variant="secondary" disabled={isSelecting} onClick={onGallery}>
          Elegir de galería
        </Button>
        <Button variant="ghost" disabled={isSelecting} onClick={onManual}>
          Registrar manualmente
        </Button>
        <Button variant="ghost" disabled={isSelecting} onClick={onCancel}>
          Volver
        </Button>
      </div>
    </Surface>
  )
}
import { Button } from '../../components/Button'
import { LoadingState } from '../../components/LoadingState'
import { Surface } from '../../components/Surface'
