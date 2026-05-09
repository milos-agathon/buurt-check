import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import { registerSW } from 'virtual:pwa-register'
import { initAnalytics } from './services/clientEvents'
import { prewarmAddressApi } from './services/api'
import { initSentry } from './services/errorReporting'
import './i18n'
import './styles/satoshi.css'
import './styles/tokens.css'
import './index.css'
import App from './App.tsx'

initSentry()
initAnalytics()
prewarmAddressApi()

if ('serviceWorker' in navigator && import.meta.env.DEV) {
  void navigator.serviceWorker.getRegistrations()
    .then(async (registrations) => {
      if (registrations.length === 0) return

      await Promise.all(registrations.map((registration) => registration.unregister()))

      if (navigator.serviceWorker.controller) {
        window.location.reload()
      }
    })
    .catch((error: unknown) => {
      console.warn('Service worker cleanup failed', error)
    })
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
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
