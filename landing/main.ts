import './styles.css'
import { initializeTheme } from './theme'

const disposeTheme = initializeTheme()
if (import.meta.hot) import.meta.hot.dispose(disposeTheme)

const year = document.querySelector<HTMLElement>('[data-current-year]')
if (year) year.textContent = String(new Date().getFullYear())
