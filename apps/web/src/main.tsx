import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { getDomainRedirectUrl } from './utils/domainRedirect'

const rootElement = document.getElementById('root')!
const domainRedirectUrl = getDomainRedirectUrl(
  window.location.hostname,
  window.location.pathname,
  window.location.search,
)

if (domainRedirectUrl) {
  try {
    window.location.replace(domainRedirectUrl)
  } catch {
    // 某些极端环境下 replace 可能失败；此时只保留提示，不挂载打卡应用
  }
  rootElement.className = 'boot-screen'
  rootElement.setAttribute('aria-live', 'polite')
  rootElement.textContent = '系统已升级，正在为您自动跳转至新官网...'
} else {
  createRoot(rootElement).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}
