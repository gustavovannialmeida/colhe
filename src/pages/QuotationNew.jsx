import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtBRL, fmtPct, calcMargin } from '../lib/helpers'

const emptyItem = () => ({
  _id: Math.random().toString(36).slice(2),
  product_id: '', product_name: '', unit: 'sc',
  quantity: '', unit_cost: '', unit_price: '', discount_pct: 0,
})

export default function QuotationNew() {
  const { seller }  = useAuth()
  const navigate    = useNavigate()
  const { id }      = useParams()          // if editing existing
  const isEdit      = !!id

  const [clients, setClients]   = useState([])
  const [products, setProducts] = useState([])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const [form, setForm] = useState({
    client_id: '', freight: '', commission_pct: '', notes: '',
  })
  const [items, setItems] = useState([emptyItem()])

  useEffect(() => {
    loadLookups()
    if (isEdit) loadExisting()
  }, [id])

  async function loadLookups() {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('products').select('id, name, unit, base_cost').eq('active', true).order('name'),
    ])
    setClients(c || [])
    setProducts(p || [])
  }

  async function loadExisting() {
    const { data: q } = await supabase.from('quotations').select('*').eq('id', id).single()
    if (!q) return
    setForm({ client_id: q.client_id, freight: q.freight || '', commission_pct: q.commission_pct || '', notes: q.notes || '' })
    const { data: qi } = await supabase.from('quotation_items')
      .select('*, product:products(name)').eq('quotation_id', id)
    setItems((qi || []).map(i => ({
      _id: i.id, id: i.id,
      product_id: i.product_id,
      product_name: i.product?.name || '',
      unit: i.unit, quantity: i.quantity,
      unit_cost: i.unit_cost, unit_price: i.unit_price,
      discount_pct: i.discount_pct || 0,
    })))
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function setItem(idx, k, v) {
    setItems(its => its.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [k]: v }
      // Auto-fill unit/cost when product changes
      if (k === 'product_id') {
        const prod = products.find(p => p.id === v)
        if (prod) {
          updated.unit      = prod.unit
          updated.unit_cost = prod.base_cost || ''
          updated.product_name = prod.name
        }
      }
      return updated
    }))
  }

  function addItem()     { setItems(its => [...its, emptyItem()]) }
  function removeItem(idx) { setItems(its => its.filter((_, i) => i !== idx)) }

  // Totals
  const totals = items.reduce((acc, it) => {
    const qty = Number(it.quantity) || 0
    const fp  = Number(it.unit_price) * (1 - (Number(it.discount_pct) || 0) / 100)
    const cost = Number(it.unit_cost) || 0
    acc.revenue += qty * fp
    acc.cost    += qty * cost
    return acc
  }, { revenue: 0, cost: 0 })

  const grossMargin = totals.revenue ? ((totals.revenue - totals.cost) / totals.revenue) * 100 : 0
  const netMargin   = totals.revenue
    ? ((totals.revenue - totals.cost - (Number(form.freight) || 0)
        - totals.revenue * (Number(form.commission_pct) || 0) / 100)
       / totals.revenue) * 100
    : 0

  async function handleSave(statusOverride) {
    setError('')
    if (!form.client_id) return setError('Selecione o cliente.')
    const validItems = items.filter(i => i.product_id && i.quantity && i.unit_price && i.unit_cost)
    if (validItems.length === 0) return setError('Adicione pelo menos um item com todos os campos preenchidos.')

    setSaving(true)
    try {
      const payload = {
        client_id: form.client_id,
        seller_id: seller.id,
        freight: Number(form.freight) || 0,
        commission_pct: Number(form.commission_pct) || 0,
        notes: form.notes,
        ...(statusOverride ? { status: statusOverride } : {}),
      }

      let quotationId = id
      if (isEdit) {
        await supabase.from('quotations').update(payload).eq('id', id)
        // Delete existing items and re-insert
        await supabase.from('quotation_items').delete().eq('quotation_id', id)
      } else {
        const { data: q, error: qErr } = await supabase.from('quotations').insert(payload).select().single()
        if (qErr) throw qErr
        quotationId = q.id
      }

      const itemsPayload = validItems.map(i => ({
        quotation_id: quotationId,
        product_id:   i.product_id,
        unit:         i.unit,
        quantity:     Number(i.quantity),
        unit_cost:    Number(i.unit_cost),
        unit_price:   Number(i.unit_price),
        discount_pct: Number(i.discount_pct) || 0,
      }))
      const { error: iErr } = await supabase.from('quotation_items').insert(itemsPayload)
      if (iErr) throw iErr

      // Log history
      await supabase.from('quotation_history').insert({
        quotation_id: quotationId,
        seller_id: seller.id,
        new_status: statusOverride || 'rascunho',
        note: isEdit ? 'Cotação editada' : 'Cotação criada',
      })

      navigate(`/cotacoes/${quotationId}`)
    } catch (e) {
      setError(e.message || 'Erro ao salvar.')
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)} style={{ marginBottom: 8 }}>
            ← Voltar
          </button>
          <h2>{isEdit ? 'Editar cotação' : 'Nova cotação'}</h2>
        </div>
        <div className="row">
          <button className="btn btn-secondary" onClick={() => handleSave('rascunho')} disabled={saving}>
            Salvar rascunho
          </button>
          <button className="btn btn-primary" onClick={() => handleSave('enviada')} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar e enviar'}
          </button>
        </div>
      </div>

      <div className="page-body">
        {error && <div className="alert alert-error">{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
          {/* Main */}
          <div className="stack">
            {/* Header info */}
            <div className="card">
              <div className="card-header"><span className="card-title">Dados da cotação</span></div>
              <div className="card-body">
                <div className="form-grid form-grid-2" style={{ gap: 16 }}>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Cliente *</label>
                    <select className="form-control" value={form.client_id} onChange={e => setF('client_id', e.target.value)}>
                      <option value="">Selecione o cliente…</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Frete (R$)</label>
                    <input className="form-control" type="number" min="0" step="0.01"
                      placeholder="0,00" value={form.freight} onChange={e => setF('freight', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Comissão (%)</label>
                    <input className="form-control" type="number" min="0" max="100" step="0.1"
                      placeholder="0,0" value={form.commission_pct} onChange={e => setF('commission_pct', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label className="form-label">Observações</label>
                    <textarea className="form-control" rows={3} value={form.notes}
                      onChange={e => setF('notes', e.target.value)} placeholder="Condições, prazo, etc." />
                  </div>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Produtos</span>
                <button className="btn btn-secondary btn-sm" onClick={addItem}>+ Item</button>
              </div>
              <div className="card-body" style={{ padding: '12px 0 16px', overflowX: 'auto' }}>
                <table className="items-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 180 }}>Produto</th>
                      <th style={{ width: 80 }}>Qtd</th>
                      <th style={{ width: 70 }}>Un.</th>
                      <th style={{ width: 120 }}>Custo unit.</th>
                      <th style={{ width: 120 }}>Preço unit.</th>
                      <th style={{ width: 80 }}>Desc.%</th>
                      <th style={{ width: 80 }}>Margem</th>
                      <th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => {
                      const margin = calcMargin(Number(it.unit_price), Number(it.discount_pct), Number(it.unit_cost))
                      return (
                        <tr key={it._id}>
                          <td>
                            <select className="form-control"
                              value={it.product_id}
                              onChange={e => setItem(idx, 'product_id', e.target.value)}>
                              <option value="">Selecione…</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </td>
                          <td>
                            <input className="form-control" type="number" min="0" step="any"
                              value={it.quantity} onChange={e => setItem(idx, 'quantity', e.target.value)} />
                          </td>
                          <td>
                            <input className="form-control" value={it.unit}
                              onChange={e => setItem(idx, 'unit', e.target.value)} />
                          </td>
                          <td>
                            <input className="form-control" type="number" min="0" step="0.01"
                              value={it.unit_cost} onChange={e => setItem(idx, 'unit_cost', e.target.value)}
                              placeholder="0,00" />
                          </td>
                          <td>
                            <input className="form-control" type="number" min="0" step="0.01"
                              value={it.unit_price} onChange={e => setItem(idx, 'unit_price', e.target.value)}
                              placeholder="0,00" />
                          </td>
                          <td>
                            <input className="form-control" type="number" min="0" max="100" step="0.1"
                              value={it.discount_pct} onChange={e => setItem(idx, 'discount_pct', e.target.value)} />
                          </td>
                          <td>
                            {it.unit_price && it.unit_cost
                              ? <span className={`margin-pill ${margin >= 0 ? 'margin-pos' : 'margin-neg'}`}>
                                  {fmtPct(margin)}
                                </span>
                              : <span style={{ color: 'var(--text-3)', fontSize: '.75rem' }}>—</span>
                            }
                          </td>
                          <td>
                            <button className="btn btn-sm" style={{ color: 'var(--red-600)', background: 'none', padding: 4 }}
                              onClick={() => removeItem(idx)} disabled={items.length === 1}>✕</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Sidebar summary */}
          <div className="stack">
            <div className="card">
              <div className="card-header"><span className="card-title">Resumo</span></div>
              <div className="card-body">
                <div className="stack" style={{ gap: 12 }}>
                  <SummaryRow label="Receita total"    value={fmtBRL(totals.revenue)} bold />
                  <SummaryRow label="Custo total"      value={fmtBRL(totals.cost)} />
                  <SummaryRow label="Frete"            value={fmtBRL(Number(form.freight) || 0)} />
                  <SummaryRow label="Comissão"
                    value={fmtBRL(totals.revenue * (Number(form.commission_pct) || 0) / 100)} />
                  <div className="divider" style={{ margin: '4px 0' }} />
                  <SummaryRow
                    label="Margem bruta"
                    value={<span className={`margin-pill ${grossMargin >= 0 ? 'margin-pos' : 'margin-neg'}`}>{fmtPct(grossMargin)}</span>}
                    bold
                  />
                  <SummaryRow
                    label="Margem líquida"
                    value={<span className={`margin-pill ${netMargin >= 0 ? 'margin-pos' : 'margin-neg'}`}>{fmtPct(netMargin)}</span>}
                    bold
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function SummaryRow({ label, value, bold }) {
  return (
    <div className="row-between">
      <span style={{ fontSize: '.8125rem', color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontSize: bold ? '.9375rem' : '.875rem', fontWeight: bold ? 700 : 500, color: 'var(--text-1)' }}>{value}</span>
    </div>
  )
}
