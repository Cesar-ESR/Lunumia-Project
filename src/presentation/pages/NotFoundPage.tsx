import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'

export function NotFoundPage() {
  return (
    <EmptyState
      title="Página no encontrada"
      description="La dirección que buscas no existe en Lunumia."
      action={
        <Link className="button" to="/dashboard">
          Volver al Dashboard
        </Link>
      }
    />
  )
}
