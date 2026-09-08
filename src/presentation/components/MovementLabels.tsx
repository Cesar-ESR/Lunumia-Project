import { ReceiptText } from 'lucide-react'
import type { MovementListItem } from '../utils/movement-view-model'

export function MovementLabels({ movement }: { movement: MovementListItem }) {
  return (
    <div className="ln-movement-labels">
      <span className={`ln-status-label ln-status-label--${movement.kind}`}>
        {movement.statusLabel}
      </span>
      {movement.kind === 'expense' && movement.source === 'receipt' ? (
        <span
          className="ln-status-label ln-receipt-label"
          role="img"
          aria-label="Registrado desde recibo"
        >
          <ReceiptText aria-hidden="true" />
          Recibo
        </span>
      ) : null}
    </div>
  )
}
