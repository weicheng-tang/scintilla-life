import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { BrowserRouter } from 'react-router-dom'
import { getBasename } from './lib/pb'
import './_rh_session_bootstrap'
// Visual Edit runtime, dev only. 不要删这一行.
// (生产 build 时 import.meta.env.DEV = false, 整段被 tree-shake 掉.)
if (import.meta.env.DEV) import('./_rh_inspect').catch(() => undefined)


// 不用 StrictMode：它只在开发模式的双渲染/双挂载，配合 R3F 的 Canvas 会把
// 每次提交的工作翻倍（开发服务器上观察到的卡顿与闪动，生产构建本就没有）。
createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename={getBasename()}><App /></BrowserRouter>,
)
