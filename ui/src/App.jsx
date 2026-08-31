import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import Dashboard    from './pages/Dashboard'
import ApiProxies   from './pages/ApiProxies'
import ProxyDetailPage from './pages/ProxyDetailPage'
import SharedFlows  from './pages/SharedFlows'
import SharedFlowDetailPage from './pages/SharedFlowDetailPage';
import KeyValueMaps from './pages/KeyValueMaps'
import KeyValueMapDetail from './pages/KeyValueMapDetail'
import Caches from './pages/Caches'
import FlowHooks from './pages/FlowHooks'
import Configuracion  from './pages/Configuracion'
import TraceAnalyzer  from './pages/TraceAnalyzer'

function App() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark')

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <Layout isDark={isDark} onToggleTheme={() => setIsDark(d => !d)}>
      <Routes>
        <Route path="/"             element={<Dashboard />} />
        <Route path="/proxies"      element={<ApiProxies />} />
        <Route path="/proxies/:proxyName" element={<ProxyDetailPage />} />
        <Route path="/shared-flows" element={<SharedFlows />} />
        <Route path="/shared-flows/:sharedFlowName" element={<SharedFlowDetailPage />} />
        <Route path="/kvm"          element={<KeyValueMaps />} />
        <Route path="/kvm/:kvmName" element={<KeyValueMapDetail />} />
        <Route path="/caches"       element={<Caches />} />
        <Route path="/flow-hooks"   element={<FlowHooks />} />
        <Route path="/config"       element={<Configuracion />} />
        <Route path="/trace"        element={<TraceAnalyzer />} />
        <Route path="*"             element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default App
