import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import { registerSW } from 'virtual:pwa-register'
import { initSentry } from './services/sentry'
import './i18n'
import './styles/satoshi.css'
import './styles/tokens.css'
import './index.css'
import App from './App.tsx'

initSentry()

if ('serviceWorker' in navigator) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true)
    },
    onRegisterError(error: unknown) {
      console.error('Service worker registration failed', error)
    },
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)
