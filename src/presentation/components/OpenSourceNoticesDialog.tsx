import { useEffect, useId, useMemo, useState } from 'react'
import {
  ExternalLink,
  Search,
  ChevronDown,
  ChevronRight,
  FileCode2,
} from 'lucide-react'
import { Dialog } from './Dialog'
import { Button } from './Button'
import { Notice } from './Notice'

export interface ThirdPartyLicense {
  name: string
  version: string
  license: string
  author: string
  repository: string
  description: string
  licenseText: string
}

export function OpenSourceNoticesDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose(): void
}) {
  const [licenses, setLicenses] = useState<ThirdPartyLicense[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const searchInputId = useId()

  useEffect(() => {
    if (!open) return
    if (licenses !== null) return

    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true)
        setError(null)
      }
    })

    // Using relative path './licenses.json' with fallback to '/licenses.json'
    // for seamless support in web, PWA and local Capacitor / Android asset contexts
    const fetchPath =
      typeof window !== 'undefined' && window.location.protocol === 'file:'
        ? './licenses.json'
        : '/licenses.json'

    fetch(fetchPath)
      .then((res) => {
        if (!res.ok) {
          // If relative failed, try root-relative
          if (fetchPath !== '/licenses.json') {
            return fetch('/licenses.json')
          }
          throw new Error(`Error HTTP: ${res.status}`)
        }
        return res
      })
      .then((res) => {
        if (!res.ok) throw new Error(`Error HTTP: ${res.status}`)
        return res.json() as Promise<ThirdPartyLicense[]>
      })
      .then((data) => {
        if (!cancelled) {
          setLicenses(data)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'No se pudieron cargar las licencias de terceros.',
          )
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [open, licenses])

  const filteredLicenses = useMemo(() => {
    if (!licenses) return []
    const term = searchTerm.trim().toLowerCase()
    if (!term) return licenses

    return licenses.filter(
      (pkg) =>
        pkg.name.toLowerCase().includes(term) ||
        pkg.license.toLowerCase().includes(term) ||
        pkg.author.toLowerCase().includes(term) ||
        pkg.description.toLowerCase().includes(term),
    )
  }, [licenses, searchTerm])

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Avisos de código abierto"
      description="Lunumia agradece a los autores y a la comunidad de software de código abierto. A continuación se listan las bibliotecas de terceros utilizadas en producción y sus términos legales."
      className="ln-licenses-dialog"
      actions={
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="ln-licenses-container">
        {loading ? (
          <div className="ln-licenses-loading" role="status" aria-live="polite">
            <p>Cargando información de licencias...</p>
          </div>
        ) : null}

        {error ? (
          <Notice
            tone="warning"
            message={`No se pudieron obtener las licencias: ${error}`}
          />
        ) : null}

        {licenses !== null && !loading && !error ? (
          <>
            <div className="ln-licenses-toolbar">
              <div className="ln-licenses-search-wrapper">
                <label htmlFor={searchInputId} className="visually-hidden">
                  Buscar librería o licencia
                </label>
                <Search
                  className="ln-licenses-search-icon"
                  aria-hidden="true"
                />
                <input
                  id={searchInputId}
                  type="search"
                  className="ln-licenses-search-input"
                  placeholder="Buscar por nombre, licencia o autor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <span className="ln-licenses-count" aria-live="polite">
                {filteredLicenses.length}{' '}
                {filteredLicenses.length === 1 ? 'paquete' : 'paquetes'}
              </span>
            </div>

            <div
              className="ln-licenses-list"
              role="feed"
              aria-label="Lista de dependencias"
            >
              {filteredLicenses.length === 0 ? (
                <p className="ln-licenses-empty">
                  No se encontraron paquetes con ese criterio de búsqueda.
                </p>
              ) : (
                filteredLicenses.map((pkg) => {
                  const key = `${pkg.name}@${pkg.version}`
                  const isExpanded = expandedKeys.has(key)

                  return (
                    <article key={key} className="ln-license-card">
                      <header className="ln-license-card-header">
                        <div className="ln-license-card-title">
                          <FileCode2
                            className="ln-license-icon"
                            aria-hidden="true"
                          />
                          <div>
                            <div className="ln-license-name-row">
                              <h3 className="ln-license-name">{pkg.name}</h3>
                              <span className="ln-license-version">
                                v{pkg.version}
                              </span>
                              <span className="ln-license-badge">
                                {pkg.license}
                              </span>
                            </div>
                            {pkg.description ? (
                              <p className="ln-license-desc">
                                {pkg.description}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="ln-license-card-actions">
                          {pkg.repository ? (
                            <a
                              href={pkg.repository}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="ln-license-link"
                              title={`Ver repositorio de ${pkg.name}`}
                              aria-label={`Ver repositorio de ${pkg.name}`}
                            >
                              <ExternalLink aria-hidden="true" />
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className="ln-license-expand-button"
                            onClick={() => toggleExpand(key)}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? 'Ocultar' : 'Ver'} licencia de ${pkg.name}`}
                          >
                            {isExpanded ? (
                              <>
                                <span>Ocultar texto legal</span>
                                <ChevronDown aria-hidden="true" />
                              </>
                            ) : (
                              <>
                                <span>Ver texto legal</span>
                                <ChevronRight aria-hidden="true" />
                              </>
                            )}
                          </button>
                        </div>
                      </header>

                      {pkg.author ? (
                        <p className="ln-license-author">
                          <strong>Autor:</strong> {pkg.author}
                        </p>
                      ) : null}

                      {isExpanded ? (
                        <div className="ln-license-details">
                          <pre className="ln-license-text">
                            {pkg.licenseText}
                          </pre>
                        </div>
                      ) : null}
                    </article>
                  )
                })
              )}
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  )
}
