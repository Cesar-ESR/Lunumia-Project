import { BanknoteArrowDown, BanknoteArrowUp, ScanLine } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Dialog } from './Dialog'
import { QuickActionButton } from './QuickActionButton'

const visibleRoutes = new Set(['/inicio', '/movimientos', '/plan'])

export function RegistrationQuickAction() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)

  if (!visibleRoutes.has(pathname)) return null

  return (
    <>
      <QuickActionButton
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      />
      <Dialog
        open={open}
        title="Registrar"
        description="Elige qué quieres registrar. Usaremos los flujos actuales de Lunumia."
        className="ln-action-sheet"
        onClose={() => setOpen(false)}
      >
        <nav className="ln-action-picker" aria-label="Opciones para registrar">
          <Link to="/expenses" onClick={() => setOpen(false)}>
            <BanknoteArrowDown aria-hidden="true" />
            <span>
              <strong>Gasto</strong>
              <small>Captura un gasto con el formulario actual.</small>
            </span>
          </Link>
          <Link to="/movimientos/ingresos/nuevo" onClick={() => setOpen(false)}>
            <BanknoteArrowUp aria-hidden="true" />
            <span>
              <strong>Ingreso</strong>
              <small>Registra dinero recibido.</small>
            </span>
          </Link>
          <Link to="/expenses/receipt" onClick={() => setOpen(false)}>
            <ScanLine aria-hidden="true" />
            <span>
              <strong>Escanear recibo</strong>
              <small>Abre el flujo de captura por recibo.</small>
            </span>
          </Link>
        </nav>
      </Dialog>
    </>
  )
}
