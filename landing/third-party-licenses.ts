import './styles.css'
import { initializeTheme } from './theme'

const disposeTheme = initializeTheme()
if (import.meta.hot) import.meta.hot.dispose(disposeTheme)

const year = document.querySelector<HTMLElement>('[data-current-year]')
if (year) year.textContent = String(new Date().getFullYear())

interface ThirdPartyLicense {
  name: string
  version: string
  license: string
  author: string
  repository: string
  description: string
  licenseText: string
}

let allLicenses: ThirdPartyLicense[] = []

const searchInput = document.querySelector<HTMLInputElement>('#licenses-search')
const countEl = document.querySelector<HTMLElement>('#licenses-count')
const listEl = document.querySelector<HTMLElement>('#licenses-list')

function renderList(items: ThirdPartyLicense[]) {
  if (!listEl) return

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="landing-licenses-empty">
        <p>No se encontraron paquetes con ese criterio de búsqueda.</p>
      </div>
    `
    if (countEl) countEl.textContent = '0 paquetes'
    return
  }

  if (countEl) {
    countEl.textContent = `${items.length} ${items.length === 1 ? 'paquete' : 'paquetes'}`
  }

  const html = items
    .map((item) => {
      const escapedText = item.licenseText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

      const repoLink = item.repository
        ? `<a href="${item.repository}" target="_blank" rel="noopener noreferrer" class="landing-license-repo" title="Repositorio">Repositorio ↗</a>`
        : ''

      const authorInfo = item.author
        ? `<p class="landing-license-author"><strong>Autor:</strong> ${item.author}</p>`
        : ''

      const descInfo = item.description
        ? `<p class="landing-license-desc">${item.description}</p>`
        : ''

      return `
      <article class="landing-license-card">
        <div class="landing-license-header">
          <div>
            <div class="landing-license-title-row">
              <h2 class="landing-license-title">${item.name}</h2>
              <span class="landing-license-version">v${item.version}</span>
              <span class="landing-license-tag">${item.license}</span>
            </div>
            ${descInfo}
          </div>
          <div class="landing-license-meta">
            ${repoLink}
          </div>
        </div>
        ${authorInfo}
        <details class="landing-license-details">
          <summary>Ver texto legal completo</summary>
          <pre class="landing-license-body">${escapedText}</pre>
        </details>
      </article>
    `
    })
    .join('')

  listEl.innerHTML = html
}

function filterLicenses(query: string) {
  const term = query.trim().toLowerCase()
  if (!term) {
    renderList(allLicenses)
    return
  }

  const filtered = allLicenses.filter(
    (pkg) =>
      pkg.name.toLowerCase().includes(term) ||
      pkg.license.toLowerCase().includes(term) ||
      pkg.author.toLowerCase().includes(term) ||
      pkg.description.toLowerCase().includes(term),
  )
  renderList(filtered)
}

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement
    filterLicenses(target.value)
  })
}

// Fetch licenses.json from public directory
fetch('/licenses.json')
  .then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json() as Promise<ThirdPartyLicense[]>
  })
  .then((data) => {
    allLicenses = data
    renderList(allLicenses)
  })
  .catch((err) => {
    if (listEl) {
      listEl.innerHTML = `
        <div class="landing-licenses-error" role="alert">
          <p>No se pudo cargar la información de licencias: ${err instanceof Error ? err.message : String(err)}</p>
        </div>
      `
    }
    if (countEl) countEl.textContent = 'Error al cargar'
  })
