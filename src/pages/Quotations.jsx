import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtBRL, fmtPct, fmtDate, STATUS_LABELS, STATUS_ORDER } from '../lib/helpers'

export default function Quotations() {
  const { seller } = useAuth()
  const navigate   = useNavigate()
  const isAdmin    = seller?.role === 'admin'

  const [rows, setRows]         = useState([])
  const [sellers, setSellers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [filters, setFilters]   = useState({ status: '', seller_id: '', search: '' })

  useEffect(() => { load() }, [seller])
  useEffect(() => { if (isAdmin) loadSellers() }, [isAdmin])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('v_quotation_summary').select('*')
      .order('created_at', { ascending: false })
    setRows(data || [])
    setLoading(false)
  }

  async function loadSellers() {
    const { data } = await supabase.from('sellers').select('id, name').eq('active', true)
    setSellers(data || [])
  }

  const filtered = rows.filter(r => {
    if (filters.status && r.status !== filters.status) return false
    if (filters.seller_id && r.seller_id !== filters.seller_id) return false
    if (filters.search) {
      const q = filters.search.toLowerCase()
      if (!r.code?.toLowerCase().includes(q) && !r.client_name?.toLowerCase().includes(q)) return false
    }
    return true
  })

  function setFilter(k, v) { setFilters(f => ({ ...f, [k]: v })) }

  return (
    <>
      <div className="page-header">
        <h2>Cotações</h2>
        <button className="btn btn-primary" onClick={() => navigate('/cotacoes/nova')}>
          + Nova cotação
        </button>
      </div>

      <div className="page-body stack">
        {/* Filters */}
        <div className="filters-bar">
          <input
            className="form-control"
            style={{ flex: 1, minWidth: 180 }}
            placeholder="Buscar código ou cliente…"
            value={filters.search}
            onChange={e => setFilter('search', e.target.value)}
          />
          <select className="form-control" value={filters.status} onChange={e => setFilter('status', e.target.value)}>
            <option value="">Todos os status</option>
            {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          {isAdmin && (
            <select className="form-control" value={filters.seller_id} onChange={e => setFilter('seller_id', e.target.value)}>
              <option value="">Todos os vendedores</option>
              {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {(filters.status || filters.seller_id || filters.search) && (
            <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ status: '', seller_id: '', search: '' })}>
              Limpar
            </button>
          )}
        </div>

        {/* Table */}
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div className="empty-state"><p>Carregando…</p></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <span style={{ fontSize: '2rem' }}>📋</span>
              <p>{rows.length === 0 ? 'Nenhuma cotação ainda. Crie a primeira!' : 'Nenhuma cotação encontrada com esses filtros.'}</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Cliente</th>
                    {isAdmin && <th>Vendedor</th>}
                    <th>Itens</th>
                    <th>Valor total</th>
                    <th>MB</th>
                    <th>ML</th>
                    <th>Status</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/cotacoes/${r.id}`)}>
                      <td className="td-strong">{r.code}</td>
                      <td>
                        <div>{r.client_name}</div>
                        {r.city && <div style={{ fontSize: '.75rem', color: 'var(--text-3)' }}>{r.city}/{r.state}</div>}
                      </td>
                      {isAdmin && <td>{r.seller_name}</td>}
                      <td>{r.item_count}</td>
                      <td className="td-strong">{fmtBRL(r.total_revenue)}</td>
                      <td>
                        {r.gross_margin_pct != null
                          ? <span className={`margin-pill ${r.gross_margin_pct >= 0 ? 'margin-pos' : 'margin-neg'}`}>
                              {fmtPct(r.gross_margin_pct)}
                            </span>
                          : '—'}
                      </td>
                      <td>
                        {r.net_margin_pct != null
                          ? <span className={`margin-pill ${r.net_margin_pct >= 0 ? 'margin-pos' : 'margin-neg'}`}>
                              {fmtPct(r.net_margin_pct)}
                            </span>
                          : '—'}
                      </td>
                      <td><span className={`badge badge-${r.status}`}>{STATUS_LABELS[r.status]}</span></td>
                      <td>{fmtDate(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-muted" style={{ textAlign: 'right', fontSize: '.75rem' }}>
          {filtered.length} cotação{filtered.length !== 1 ? 'ões' : ''}
        </p>
      </div>
    </>
  )
}
