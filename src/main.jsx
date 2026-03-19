import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'

const rootEl = document.getElementById('root')
try {
  const root = ReactDOM.createRoot(rootEl)
  root.render(
    React.createElement(BrowserRouter, null,
      React.createElement(App, null))
  )
} catch (err) {
  console.error('[Creatorship] Mount error', err)
  rootEl.innerHTML = '<div style="padding:24px;text-align:center;background:#030711;color:#eaeff7;min-height:100vh">Something went wrong loading the app. Check the console.</div>'
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => { console.error('[Creatorship] Uncaught error', e.error || e) })
  window.addEventListener('unhandledrejection', (e) => { console.error('[Creatorship] Unhandled rejection', e.reason) })
}
