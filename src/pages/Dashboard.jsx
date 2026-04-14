import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtBRL, fmtPct, fmtDate, STATUS_LABELS } from '../lib/helpers'

const STATUS_COLORS = {
  rascunho: '#d4d0c8', enviada: '#93c5fd',
  em_negociacao: '#fcd34d', fechada: '#6ee7b7', perdida: '#fca5a5',
}

export default function Dashboard() {
  const { seller } = useAuth()
  const navigate   = useNavigate()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const isAdmin = seller?.role === 'admin'

  useEffect(() => { load() }, [seller])

  async function load() {
    setLoading(true)
    try {
      let q = supabase.from('v_quotation_summary').select('*')
      if (!isAdmin) q = q.eq('seller_id', seller?.id) // RLS handles it, but belt-and-suspenders

      const { data: rows } = await q

      if (!rows) return

      // KPIs
      const thisMonth = new Date()
      thisMonth.setDate(1); thisMonth.setHours(0,0,0,0)

      const monthRows = rows.filter(r => new Date(r.created_at) >= thisMonth)
      const total     = rows.length
      const fechadas  = rows.filter(r => r.status === 'fechada')
      const perdidas  = rows.filter(r => r.status === 'perdida')
      const revenue   = fechadas.reduce((s, r) => s + (Number(r.total_revenue) || 0), 0)
      const avgMargin = fechadas.length
        ? fechadas.reduce((s, r) => s + (Number(r.gross_margin_pct) || 0), 0) / fechadas.length
        : 0

      // Status breakdown
      const byStatus = Object.entries(
        rows.reduce((acc, r) => {
          acc[r.status] = (acc[r.status] || 0) + 1
          return acc
        }, {})
      ).map(([name, value]) => ({ name: STATUS_LABELS[name] || name, value, key: name }))

      // Monthly revenue (last 6 months)
      const monthlyMap = {}
      for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setMonth(d.getMonth() - i)
        const key = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
        monthlyMap[key] = 0
      }
      fechadas.forEach(r => {
        const d = new Date(r.closed_at || r.created_at)
        const key = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
        if (monthlyMap[key] !== undefined) monthlyMap[key] += Number(r.total_revenue) || 0
      })
      const monthly = Object.entries(monthlyMap).map(([month, revenue]) => ({ month, revenue }))

      // Recent
      const recent = [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6)

      setData({ total, fechadas: fechadas.length, perdidas: perdidas.length, revenue, avgMargin, byStatus, monthly, recent, monthRows: monthRows.length })
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="page-body"><p className="text-muted">Carregando…</p></div>
  if (!data)   return null

  const conversion = data.total ? ((data.fechadas / data.total) * 100).toFixed(0) : 0

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p className="text-muted" style={{ marginTop: 4 }}>
            Olá, {seller?.name?.split(' ')[0]}. Aqui está seu resumo.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/cotacoes/nova')}>
          + Nova cotação
        </button>
      </div>

      <div className="page-body stack">
        {/* KPIs */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Total de cotações</div>
            <div className="kpi-value">{data.total}</div>
            <div className="kpi-sub">{data.monthRows} este mês</div>
          </div>
          <div className="kpi-card green">
            <div className="kpi-label">Negócios fechados</div>
            <div className="kpi-value">{data.fechadas}</div>
            <div className="kpi-sub">Taxa: {conversion}% de conversão</div>
          </div>
          <div className="kpi-card amber">
            <div className="kpi-label">Receita fechada</div>
            <div className="kpi-value" style={{ fontSize: '1.4rem' }}>{fmtBRL(data.revenue)}</div>
            <div className="kpi-sub">Em cotações fechadas</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Margem bruta média</div>
            <div className="kpi-value">{fmtPct(data.avgMargin)}</div>
            <div className="kpi-sub">Negócios fechados</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Monthly revenue chart */}
          <div className="card">
            <div className="card-header"><span className="card-title">Receita mensal</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.monthly} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip formatter={v => fmtBRL(v)} labelStyle={{ fontWeight: 600 }}
                    contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
                  <Bar dataKey="revenue" fill="var(--green-600)" radius={[4,4,0,0]} name="Receita" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Status pie */}
          <div className="card">
            <div className="card-header"><span className="card-title">Status das cotações</span></div>
            <div className="card-body">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={data.byStatus} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                    dataKey="value" nameKey="name" paddingAngle={2}>
                    {data.byStatus.map((entry) => (
                      <Cell key={entry.key} fill={STATUS_COLORS[entry.key] || '#ccc'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 12 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Recent quotations */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Últimas cotações</span>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/cotacoes')}>Ver todas</button>
          </div>
          <div className="card-body" style={{ padding: '12px 0 0' }}>
            {data.recent.length === 0 ? (
              <div className="empty-state"><p>Nenhuma cotação ainda.</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Código</th><th>Cliente</th>
                      {isAdmin && <th>Vendedor</th>}
                      <th>Valor</th><th>Margem</th><th>Status</th><th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map(r => (
                      <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/cotacoes/${r.id}`)}>
                        <td className="td-strong">{r.code}</td>
                        <td>{r.client_name}</td>
                        {isAdmin && <td>{r.seller_name}</td>}
                        <td>{fmtBRL(r.total_revenue)}</td>
                        <td>
                          {r.gross_margin_pct != null
                            ? <span className={`margin-pill ${r.gross_margin_pct >= 0 ? 'margin-pos' : 'margin-neg'}`}>
                                {fmtPct(r.gross_margin_pct)}
                              </span>
                            : '—'
                          }
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
        </div>
      </div>
    </>
  )
}
