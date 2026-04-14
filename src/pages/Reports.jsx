import { useEffect, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtBRL, fmtPct } from '../lib/helpers'

const PERIODS = [
  { label: 'Este mês',   months: 1 },
  { label: 'Últimos 3m', months: 3 },
  { label: 'Últimos 6m', months: 6 },
  { label: 'Este ano',   months: 12 },
]

const CATEGORIES = ['Semente','Fertilizante','Nutrição Vegetal','Adjuvante','Defensivo Agrícola']

export default function Reports() {
  const { seller } = useAuth()
  const isAdmin    = seller?.role === 'admin'

  const [period, setPeriod]   = useState(3)
  const [category, setCategory] = useState('')
  const [rows, setRows]       = useState([])
  const [itemRows, setItemRows] = useState([])   // quotation_items with category info
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [period])

  async function load() {
    setLoading(true)
    const from = new Date()
    from.setMonth(from.getMonth() - period)
    from.setHours(0,0,0,0)

    const [{ data: summaries }, { data: items }] = await Promise.all([
      supabase.from('v_quotation_summary').select('*').gte('created_at', from.toISOString()),
      supabase.from('quotation_items')
        .select('*, product:products(name,category), quotation:quotations!inner(created_at,status,seller_id,client_id)')
        .gte('quotation.created_at', from.toISOString()),
    ])
    setRows(summaries || [])
    setItemRows(items || [])
    setLoading(false)
  }

  // Filter summaries by category (if selected, only include quotations that have that category item)
  const quotIdsWithCat = category
    ? new Set(itemRows.filter(i => i.product?.category === category).map(i => i.quotation_id))
    : null

  const filteredRows = quotIdsWithCat
    ? rows.filter(r => quotIdsWithCat.has(r.id))
    : rows

  const fechadas = filteredRows.filter(r => r.status === 'fechada')
  const perdidas = filteredRows.filter(r => r.status === 'perdida')
  const emAberto = filteredRows.filter(r => !['fechada','perdida'].includes(r.status))

  const totalRevenue   = fechadas.reduce((s, r) => s + (Number(r.total_revenue) || 0), 0)
  const avgGrossMargin = fechadas.length ? fechadas.reduce((s, r) => s + (Number(r.gross_margin_pct) || 0), 0) / fechadas.length : 0
  const avgNetMargin   = fechadas.length ? fechadas.reduce((s, r) => s + (Number(r.net_margin_pct)   || 0), 0) / fechadas.length : 0

  // Funil
  const funnel = [
    { name: 'Cotadas',   value: filteredRows.length, fill: '#93c5fd' },
    { name: 'Fechadas',  value: fechadas.length,     fill: '#6ee7b7' },
    { name: 'Perdidas',  value: perdidas.length,     fill: '#fca5a5' },
    { name: 'Em aberto', value: emAberto.length,     fill: '#fcd34d' },
  ]

  // Lost reasons
  const lostMap = {}
  perdidas.forEach(r => {
    const k = r.lost_reason || 'Não informado'
    lostMap[k] = (lostMap[k] || 0) + 1
  })
  const lostData = Object.entries(lostMap).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value)

  // Revenue by category
  const catRevMap = {}
  itemRows.forEach(i => {
    if (i.quotation?.status !== 'fechada') return
    const cat = i.product?.category || 'Outros'
    const rev = Number(i.quantity) * Number(i.final_price || i.unit_price)
    catRevMap[cat] = (catRevMap[cat] || 0) + rev
  })
  const catData = Object.entries(catRevMap).map(([name, revenue]) => ({ name, revenue })).sort((a,b) => b.revenue - a.revenue)

  // By seller (admin)
  const sellerMap = {}
  filteredRows.forEach(r => {
    if (!sellerMap[r.seller_name]) sellerMap[r.seller_name] = { name: r.seller_name, total: 0, fechadas: 0, revenue: 0 }
    sellerMap[r.seller_name].total++
    if (r.status === 'fechada') {
      sellerMap[r.seller_name].fechadas++
      sellerMap[r.seller_name].revenue += Number(r.total_revenue) || 0
    }
  })
  const sellerData = Object.values(sellerMap).sort((a,b) => b.revenue - a.revenue)

  return (
    <>
      <div className="page-header">
        <h2>Relatórios</h2>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {PERIODS.map(p => (
            <button key={p.months}
              className={`btn ${period === p.months ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => setPeriod(p.months)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body stack">
        {/* Category filter */}
        <div className="filters-bar">
          <span style={{ fontSize: '.8125rem', fontWeight: 600, color: 'var(--text-3)' }}>Filtrar por categoria:</span>
          <button className={`btn btn-sm ${!category ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setCategory('')}>
            Todas
          </button>
          {CATEGORIES.map(c => (
            <button key={c} className={`btn btn-sm ${category === c ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>

        {loading ? <p className="text-muted">Carregando…</p> : (
          <>
            {/* KPIs */}
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-label">Cotações no período</div>
                <div className="kpi-value">{filteredRows.length}</div>
                <div className="kpi-sub">
                  {filteredRows.length ? ((fechadas.length / filteredRows.length) * 100).toFixed(0) : 0}% de conversão
                </div>
              </div>
              <div className="kpi-card green">
                <div className="kpi-label">Receita fechada{category ? ` · ${category}` : ''}</div>
                <div className="kpi-value" style={{ fontSize: '1.4rem' }}>{fmtBRL(totalRevenue)}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Margem bruta média</div>
                <div className="kpi-value">{fmtPct(avgGrossMargin)}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Margem líquida média</div>
                <div className="kpi-value">{fmtPct(avgNetMargin)}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Funil */}
              <div className="card">
                <div className="card-header"><span className="card-title">Funil de cotações</span></div>
                <div className="card-body">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={funnel} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                      <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: 'var(--text-2)' }} axisLine={false} tickLine={false} width={70} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
                      <Bar dataKey="value" radius={[0,4,4,0]} name="Qtd">
                        {funnel.map((e,i) => <Cell key={i} fill={e.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Motivos de perda */}
              <div className="card">
                <div className="card-header"><span className="card-title">Motivos de perda</span></div>
                <div className="card-body">
                  {lostData.length === 0 ? (
                    <div className="empty-state" style={{ padding: 24 }}><p>Nenhuma perda no período 🎉</p></div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={lostData} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                        <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: 'var(--text-2)' }} axisLine={false} tickLine={false} width={90} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
                        <Bar dataKey="value" fill="var(--red-600)" radius={[0,4,4,0]} name="Qtd" opacity={0.75} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Receita por categoria */}
            {catData.length > 0 && (
              <div className="card">
                <div className="card-header"><span className="card-title">Receita por categoria (fechadas)</span></div>
                <div className="card-body">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={catData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false}
                        tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                      <Tooltip formatter={v => fmtBRL(v)} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
                      <Bar dataKey="revenue" fill="var(--green-600)" radius={[4,4,0,0]} name="Receita" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Por vendedor */}
            {isAdmin && sellerData.length > 0 && (
              <div className="card">
                <div className="card-header"><span className="card-title">Por vendedor</span></div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Vendedor</th><th>Total</th><th>Fechadas</th><th>Conversão</th><th>Receita</th></tr>
                    </thead>
                    <tbody>
                      {sellerData.map(s => (
                        <tr key={s.name}>
                          <td className="td-strong">{s.name}</td>
                          <td>{s.total}</td>
                          <td>{s.fechadas}</td>
                          <td>
                            <span className="margin-pill margin-pos">
                              {s.total ? ((s.fechadas / s.total) * 100).toFixed(0) : 0}%
                            </span>
                          </td>
                          <td className="td-strong">{fmtBRL(s.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Negócios fechados */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Negócios fechados</span>
                <span className="tag">{fechadas.length} · {fmtBRL(totalRevenue)}</span>
              </div>
              {fechadas.length === 0 ? (
                <div className="empty-state"><p>Nenhum negócio fechado no período.</p></div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Código</th><th>Cliente</th>
                        {isAdmin && <th>Vendedor</th>}
                        <th>Receita</th><th>MB</th><th>ML</th><th>Fechada em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fechadas.map(r => (
                        <tr key={r.id}>
                          <td className="td-strong">{r.code}</td>
                          <td>{r.client_name}</td>
                          {isAdmin && <td>{r.seller_name}</td>}
                          <td className="td-strong">{fmtBRL(r.total_revenue)}</td>
                          <td><span className={`margin-pill ${r.gross_margin_pct >= 0 ? 'margin-pos' : 'margin-neg'}`}>{fmtPct(r.gross_margin_pct)}</span></td>
                          <td><span className={`margin-pill ${r.net_margin_pct >= 0 ? 'margin-pos' : 'margin-neg'}`}>{fmtPct(r.net_margin_pct)}</span></td>
                          <td>{r.closed_at ? new Date(r.closed_at).toLocaleDateString('pt-BR') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
