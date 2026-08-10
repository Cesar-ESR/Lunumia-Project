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
    <section
      className="panel receipt-source"
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
      {isSelecting ? (
        <p className="receipt-inline-status" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          Preparando imagen…
        </p>
      ) : null}
      <div className="receipt-source-actions">
        <button className="button" disabled={isSelecting} onClick={onCamera}>
          Tomar foto
        </button>
        <button
          className="button secondary"
          disabled={isSelecting}
          onClick={onGallery}
        >
          Elegir de galería
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
          Volver
        </button>
      </div>
    </section>
  )
}
