import './styles.css'

const year = document.querySelector<HTMLElement>('[data-current-year]')
if (year) year.textContent = String(new Date().getFullYear())
