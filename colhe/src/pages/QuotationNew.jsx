import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtBRL, fmtPct, calcMargin } from '../lib/helpers'

const emptyItem = () => ({
  _id: Math.random().toString(36).slice(2),
  product_id: '', product_name: '', product_category: '', unit: 'sc',
  quantity: '', unit_cost: '', unit_price: '', discount_pct: 0,
  tsi: [],   // array of TSI treatments
})

const emptyTsi = () => ({
  _id: Math.random().toString(36).slice(2),
  tsi_name: '', quantity: '', unit: 'L', unit_cost: '', unit_price: '',
})

export default function QuotationNew() {
  const { seller }   = useAuth()
  const navigate     = useNavigate()
  const [searchParams] = useSearchParams()
  const editId       = searchParams.get('edit')
  const isEdit       = !!editId

  const [clients, setClients]       = useState([])
  const [products, setProducts]     = useState([])
  const [tsiCatalog, setTsiCatalog] = useState([])
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const [form, setForm] = useState({ client_id: '', freight: '', commission_pct: '', notes: '' })
  const [items, setItems] = useState([emptyItem()])

  useEffect(() => {
    loadLookups()
    if (isEdit) loadExisting()
  }, [editId])

  async function loadLookups() {
    const [{ data: c }, { data: p }, { data: t }] = await Promise.all([
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('products').select('id, name, unit, base_cost, category').eq('active', true).order('name'),
      supabase.from('tsi_catalog').select('*').eq('active', true).order('category').order('name'),
    ])
    setClients(c || [])
    setProducts(p || [])
    setTsiCatalog(t || [])
  }

  async function loadExisting() {
    const { data: q } = await supabase.from('quotations').select('*').eq('id', editId).single()
    if (!q) return
    setForm({ client_id: q.client_id, freight: q.freight || '', commission_pct: q.commission_pct || '', notes: q.notes || '' })
    const { data: qi } = await supabase.from('quotation_items')
      .select('*, product:products(name, category), tsi:quotation_item_tsi(*)').eq('quotation_id', editId)
    setItems((qi || []).map(i => ({
      _id: i.id, id: i.id,
      product_id: i.product_id,
      product_name: i.product?.name || '',
      product_category: i.product?.category || '',
      unit: i.unit, quantity: i.quantity,
      unit_cost: i.unit_cost, unit_price: i.unit_price,
      discount_pct: i.discount_pct || 0,
      tsi: (i.tsi || []).map(t => ({ ...t, _id: t.id })),
    })))
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function setItem(idx, k, v) {
    setItems(its => its.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [k]: v }
      if (k === 'product_id') {
        const prod = products.find(p => p.id === v)
        if (prod) {
          updated.unit             = prod.unit
          updated.unit_cost        = prod.base_cost || ''
          updated.product_name     = prod.name
          updated.product_category = prod.category || ''
          // Clear TSI if not a seed anymore
          if (prod.category !== 'Semente') updated.tsi = []
        }
      }
      return updated
    }))
  }

  function addItem()       { setItems(its => [...its, emptyItem()]) }
  function removeItem(idx) { setItems(its => its.filter((_, i) => i !== idx)) }

  // TSI handlers
  function addTsi(itemIdx) {
    setItems(its => its.map((it, i) => i !== itemIdx ? it : { ...it, tsi: [...it.tsi, emptyTsi()] }))
  }
  function removeTsi(itemIdx, tsiIdx) {
    setItems(its => its.map((it, i) => i !== itemIdx ? it : {
      ...it, tsi: it.tsi.filter((_, j) => j !== tsiIdx)
    }))
  }
  function setTsiField(itemIdx, tsiIdx, k, v) {
    setItems(its => its.map((it, i) => {
      if (i !== itemIdx) return it
      const newTsi = it.tsi.map((t, j) => {
        if (j !== tsiIdx) return t
        const updated = { ...t, [k]: v }
        // Auto-fill from catalog
        if (k === 'tsi_name') {
          const cat = tsiCatalog.find(c => c.name === v)
          if (cat) {
            updated.unit      = cat.unit
            updated.unit_cost = cat.base_cost || ''
          }
        }
        return updated
      })
      return { ...it, tsi: newTsi }
    }))
  }

  // Totals
  const totals = items.reduce((acc, it) => {
    const qty  = Number(it.quantity) || 0
    const fp   = Number(it.unit_price) * (1 - (Number(it.discount_pct) || 0) / 100)
    const cost = Number(it.unit_cost) || 0
    acc.revenue += qty * fp
    acc.cost    += qty * cost
    // TSI
    it.tsi.forEach(t => {
      acc.revenue += (Number(t.quantity) || 0) * (Number(t.unit_price) || 0)
      acc.cost    += (Number(t.quantity) || 0) * (Number(t.unit_cost) || 0)
    })
    return acc
  }, { revenue: 0, cost: 0 })

  const grossMargin = totals.revenue
    ? ((totals.revenue - totals.cost) / totals.revenue) * 100 : 0
  const netMargin   = totals.revenue
    ? ((totals.revenue - totals.cost - (Number(form.freight) || 0)
        - totals.revenue * (Number(form.commission_pct) || 0) / 100)
       / totals.revenue) * 100 : 0

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

      let quotationId = editId
      if (isEdit) {
        await supabase.from('quotations').update(payload).eq('id', editId)
        await supabase.from('quotation_items').delete().eq('quotation_id', editId)
      } else {
        const { data: q, error: qErr } = await supabase.from('quotations').insert(payload).select().single()
        if (qErr) throw qErr
        quotationId = q.id
      }

      // Insert items
      const { data: savedItems, error: iErr } = await supabase.from('quotation_items').insert(
        validItems.map(i => ({
          quotation_id:  quotationId,
          product_id:    i.product_id,
          unit:          i.unit,
          quantity:      Number(i.quantity),
          unit_cost:     Number(i.unit_cost),
          unit_price:    Number(i.unit_price),
          discount_pct:  Number(i.discount_pct) || 0,
        }))
      ).select()
      if (iErr) throw iErr

      // Insert TSI records
      const tsiRecords = []
      savedItems.forEach((savedItem, idx) => {
        const originalItem = validItems[idx]
        originalItem.tsi.forEach(t => {
          if (t.tsi_name && t.quantity && t.unit_price != null && t.unit_cost != null) {
            tsiRecords.push({
              quotation_item_id: savedItem.id,
              tsi_name:   t.tsi_name,
              quantity:   Number(t.quantity),
              unit:       t.unit,
              unit_cost:  Number(t.unit_cost) || 0,
              unit_price: Number(t.unit_price) || 0,
            })
          }
        })
      })
      if (tsiRecords.length > 0) {
        const { error: tErr } = await supabase.from('quotation_item_tsi').insert(tsiRecords)
        if (tErr) throw tErr
      }

      // History
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

  // Group TSI catalog by type for display
  const tsiByType = tsiCatalog.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = []
    acc[t.category].push(t)
    return acc
  }, {})

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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
          {/* Main */}
          <div className="stack">
            {/* Header */}
            <div className="card">
              <div className="card-header"><span className="card-title">Dados da cotação</span></div>
              <div className="card-body">
                <div className="form-grid form-grid-2">
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Cliente *</label>
                    <select className="form-control" value={form.client_id}
                      onChange={e => setF('client_id', e.target.value)}>
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
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Observações</label>
                    <textarea className="form-control" rows={2} value={form.notes}
                      onChange={e => setF('notes', e.target.value)} placeholder="Condições, prazo, etc." />
                  </div>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Produtos</span>
                <button className="btn btn-secondary btn-sm" onClick={addItem}>+ Produto</button>
              </div>
              <div className="card-body" style={{ padding: '8px 0 16px' }}>
                {items.map((it, idx) => (
                  <ItemRow key={it._id}
                    item={it} idx={idx}
                    products={products}
                    tsiCatalog={tsiCatalog}
                    tsiByType={tsiByType}
                    onSetItem={setItem}
                    onRemove={removeItem}
                    onAddTsi={addTsi}
                    onRemoveTsi={removeTsi}
                    onSetTsi={setTsiField}
                    showRemove={items.length > 1}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Summary sidebar */}
          <div className="card" style={{ position: 'sticky', top: 16 }}>
            <div className="card-header"><span className="card-title">Resumo</span></div>
            <div className="card-body">
              <div className="stack" style={{ gap: 12 }}>
                <SummaryRow label="Receita total" value={fmtBRL(totals.revenue)} bold />
                <SummaryRow label="Custo total"   value={fmtBRL(totals.cost)} />
                <SummaryRow label="Frete"          value={fmtBRL(Number(form.freight) || 0)} />
                <SummaryRow label="Comissão"
                  value={fmtBRL(totals.revenue * (Number(form.commission_pct) || 0) / 100)} />
                <div className="divider" style={{ margin: '4px 0' }} />
                <SummaryRow label="Margem bruta"
                  value={<span className={`margin-pill ${grossMargin >= 0 ? 'margin-pos' : 'margin-neg'}`}>{fmtPct(grossMargin)}</span>}
                  bold />
                <SummaryRow label="Margem líquida"
                  value={<span className={`margin-pill ${netMargin >= 0 ? 'margin-pos' : 'margin-neg'}`}>{fmtPct(netMargin)}</span>}
                  bold />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Item Row ─────────────────────────────────────────────── */
function ItemRow({ item, idx, products, tsiCatalog, tsiByType, onSetItem, onRemove, onAddTsi, onRemoveTsi, onSetTsi, showRemove }) {
  const isSeed   = item.product_category === 'Semente'
  const margin   = calcMargin(Number(item.unit_price), Number(item.discount_pct), Number(item.unit_cost))
  const hasTsi   = isSeed

  return (
    <div style={{ borderBottom: '1px solid var(--border-light)', padding: '12px 20px' }}>
      {/* Main item row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 70px 90px 110px 110px 70px 80px 32px', gap: 8, alignItems: 'end' }}>
        {/* Product */}
        <div>
          {idx === 0 && <div style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Produto</div>}
          <select className="form-control" value={item.product_id}
            onChange={e => onSetItem(idx, 'product_id', e.target.value)}>
            <option value="">Selecione…</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {/* Qty */}
        <div>
          {idx === 0 && <ColLabel>Qtd</ColLabel>}
          <input className="form-control" type="number" min="0" step="any"
            value={item.quantity} onChange={e => onSetItem(idx, 'quantity', e.target.value)} />
        </div>
        {/* Unit */}
        <div>
          {idx === 0 && <ColLabel>Unidade</ColLabel>}
          <input className="form-control" value={item.unit}
            onChange={e => onSetItem(idx, 'unit', e.target.value)} />
        </div>
        {/* Cost */}
        <div>
          {idx === 0 && <ColLabel>Custo unit.</ColLabel>}
          <input className="form-control" type="number" min="0" step="0.01"
            placeholder="0,00" value={item.unit_cost}
            onChange={e => onSetItem(idx, 'unit_cost', e.target.value)} />
        </div>
        {/* Price */}
        <div>
          {idx === 0 && <ColLabel>Preço unit.</ColLabel>}
          <input className="form-control" type="number" min="0" step="0.01"
            placeholder="0,00" value={item.unit_price}
            onChange={e => onSetItem(idx, 'unit_price', e.target.value)} />
        </div>
        {/* Discount */}
        <div>
          {idx === 0 && <ColLabel>Desc.%</ColLabel>}
          <input className="form-control" type="number" min="0" max="100" step="0.1"
            value={item.discount_pct} onChange={e => onSetItem(idx, 'discount_pct', e.target.value)} />
        </div>
        {/* Margin */}
        <div>
          {idx === 0 && <ColLabel>Margem</ColLabel>}
          <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
            {item.unit_price && item.unit_cost
              ? <span className={`margin-pill ${margin >= 0 ? 'margin-pos' : 'margin-neg'}`}>{fmtPct(margin)}</span>
              : <span style={{ color: 'var(--text-3)', fontSize: '.75rem' }}>—</span>
            }
          </div>
        </div>
        {/* Remove */}
        <div style={{ display: 'flex', alignItems: 'end' }}>
          {showRemove && (
            <button className="btn btn-sm" style={{ color: 'var(--red-600)', background: 'none', padding: 4 }}
              onClick={() => onRemove(idx)}>✕</button>
          )}
        </div>
      </div>

      {/* TSI section — only for seeds */}
      {hasTsi && (
        <div style={{ marginTop: 10, paddingLeft: 16, borderLeft: '2px solid var(--green-100)' }}>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--green-700)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              🌱 TSI — Tratamentos de Semente
            </span>
            <button className="btn btn-sm" style={{ color: 'var(--green-700)', background: 'var(--green-50)', border: '1px solid var(--green-100)', fontSize: '.75rem' }}
              onClick={() => onAddTsi(idx)}>
              + Adicionar tratamento
            </button>
          </div>

          {item.tsi.length === 0 && (
            <p style={{ fontSize: '.8rem', color: 'var(--text-3)', padding: '4px 0' }}>
              Nenhum tratamento adicionado. Clique em "+ Adicionar tratamento" para incluir.
            </p>
          )}

          {item.tsi.map((t, tIdx) => (
            <TsiRow key={t._id}
              tsi={t} tIdx={tIdx} itemIdx={idx}
              tsiCatalog={tsiCatalog} tsiByType={tsiByType}
              onSet={onSetTsi} onRemove={onRemoveTsi}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── TSI Row ──────────────────────────────────────────────── */
function TsiRow({ tsi, tIdx, itemIdx, tsiCatalog, tsiByType, onSet, onRemove }) {
  const tsiMargin = tsi.unit_price && tsi.unit_cost
    ? ((Number(tsi.unit_price) - Number(tsi.unit_cost)) / Number(tsi.unit_price) * 100)
    : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 70px 110px 110px 80px 32px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
      {/* Tratamento */}
      <select className="form-control" style={{ fontSize: '.8125rem' }}
        value={tsi.tsi_name} onChange={e => onSet(itemIdx, tIdx, 'tsi_name', e.target.value)}>
        <option value="">Selecione o tratamento…</option>
        {Object.entries(tsiByType).map(([type, items]) => (
          <optgroup key={type} label={type}>
            {items.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </optgroup>
        ))}
        <option value="__custom__">Outro (digitar)</option>
      </select>

      {/* Qty */}
      <input className="form-control" type="number" min="0" step="any" placeholder="Qtd"
        style={{ fontSize: '.8125rem' }}
        value={tsi.quantity} onChange={e => onSet(itemIdx, tIdx, 'quantity', e.target.value)} />

      {/* Unit */}
      <input className="form-control" placeholder="Un."
        style={{ fontSize: '.8125rem' }}
        value={tsi.unit} onChange={e => onSet(itemIdx, tIdx, 'unit', e.target.value)} />

      {/* Cost */}
      <input className="form-control" type="number" min="0" step="0.01" placeholder="Custo (R$)"
        style={{ fontSize: '.8125rem' }}
        value={tsi.unit_cost} onChange={e => onSet(itemIdx, tIdx, 'unit_cost', e.target.value)} />

      {/* Price */}
      <input className="form-control" type="number" min="0" step="0.01" placeholder="Preço (R$)"
        style={{ fontSize: '.8125rem' }}
        value={tsi.unit_price} onChange={e => onSet(itemIdx, tIdx, 'unit_price', e.target.value)} />

      {/* Margin */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {tsiMargin != null
          ? <span className={`margin-pill ${tsiMargin >= 0 ? 'margin-pos' : 'margin-neg'}`} style={{ fontSize: '.7rem' }}>
              {fmtPct(tsiMargin)}
            </span>
          : <span style={{ color: 'var(--text-3)', fontSize: '.75rem' }}>—</span>
        }
      </div>

      {/* Remove */}
      <button className="btn btn-sm" style={{ color: 'var(--red-600)', background: 'none', padding: 4 }}
        onClick={() => onRemove(itemIdx, tIdx)}>✕</button>
    </div>
  )
}

/* ── Helpers ──────────────────────────────────────────────── */
function ColLabel({ children }) {
  return (
    <div style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
      {children}
    </div>
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
