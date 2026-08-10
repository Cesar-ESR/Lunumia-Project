import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './presentation/App'
import './presentation/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
