import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Quotations from './pages/Quotations'
import QuotationNew from './pages/QuotationNew'
import QuotationDetail from './pages/QuotationDetail'
import ProposalView from './pages/ProposalView'
import Reports from './pages/Reports'
import Team from './pages/Team'
import Meetings from './pages/Meetings'
import Settings from './pages/Settings'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen"><span>Colhe</span></div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading-screen"><span>Colhe</span></div>

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />

      {/* Proposal — full page, no sidebar */}
      <Route path="/proposta/:id" element={
        <ProtectedRoute><ProposalView /></ProtectedRoute>
      } />

      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"     element={<Dashboard />} />
        <Route path="cotacoes"      element={<Quotations />} />
        <Route path="cotacoes/nova" element={<QuotationNew />} />
        <Route path="cotacoes/:id"  element={<QuotationDetail />} />
        <Route path="relatorios"    element={<Reports />} />
        <Route path="equipe"        element={<Team />} />
        <Route path="reunioes"      element={<Meetings />} />
        <Route path="configuracoes" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
