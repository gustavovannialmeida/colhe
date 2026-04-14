import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtBRL, fmtPct, calcMargin } from '../lib/helpers'

const UNITS = ['sc','sc 60.000 sem','big-bag 5MM','big-bag 2,5MM','kg','L','cx','un','t','ha','doses']

const emptyItem = () => ({
  _id: Math.random().toString(36).slice(2),
  product_name: '', product_category: '', unit: 'sc',
  quantity: '', unit_cost: '', unit_price: '', discount_pct: 0,
  unit_freight: '', tsi: [],
})

const emptyTsi = () => ({
  _id: Math.random().toString(36).slice(2),
  tsi_name: '', quantity: '', unit: 'L', unit_cost: '', unit_price: '',
})

export default function QuotationNew() {
  const { seller }     = useAuth()
  const navigate       = useNavigate()
  const [searchParams] = useSearchParams()
  const editId         = searchParams.get('edit')
  const isEdit         = !!editId

  const [clientSuggestions, setClientSuggestions]   = useState([])
  const [productSuggestions, setProductSuggestions] = useState([])
  const [tsiCatalog, setTsiCatalog]                 = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const [form, setForm] = useState({
    client_name: '', payment_date: '', commission_pct: '', notes: '',
  })
  const [items, setItems] = useState([emptyItem()])

  useEffect(() => {
    loadSuggestions()
    if (isEdit) loadExisting()
  }, [editId])

  async function loadSuggestions() {
    const [{ data: clients }, { data: prevItems }, { data: tsi }, { data: prevQuots }] = await Promise.all([
      supabase.from('clients').select('name').order('name'),
      supabase.from('quotation_items').select('product_name_free, product_category_free, unit').not('product_name_free', 'is', null),
      supabase.from('tsi_catalog').select('*').eq('active', true).order('category').order('name'),
      supabase.from('quotations').select('client_name_free').not('client_name_free', 'is', null),
    ])
    const clientNames = new Set([
      ...(clients || []).map(c => c.name),
      ...(prevQuots || []).map(q => q.client_name_free).filter(Boolean),
    ])
    setClientSuggestions([...clientNames].sort())
    const productMap = {}
    ;(prevItems || []).forEach(i => {
      if (i.product_name_free && !productMap[i.product_name_free]) {
        productMap[i.product_name_free] = { name: i.product_name_free, category: i.product_category_free || '', unit: i.unit || 'sc' }
      }
    })
    setProductSuggestions(Object.values(productMap))
    setTsiCatalog(tsi || [])
  }

  async function loadExisting() {
    const { data: q } = await supabase.from('quotations').select('*').eq('id', editId).single()
    if (!q) return
    setForm({
      client_name:    q.client_name_free || '',
      payment_date:   q.payment_date || '',
      commission_pct: q.commission_pct || '',
      notes:          q.notes || '',
    })
    const { data: qi } = await supabase.from('quotation_items')
      .select('*, tsi:quotation_item_tsi(*)').eq('quotation_id', editId)
    setItems((qi || []).map(i => ({
      _id: i.id, id: i.id,
      product_name:     i.product_name_free || '',
      product_category: i.product_category_free || '',
      unit: i.unit, quantity: i.quantity,
      unit_cost: i.unit_cost, unit_price: i.unit_price,
      discount_pct: i.discount_pct || 0,
      unit_freight: i.unit_freight || '',
      tsi: (i.tsi || []).map(t => ({ ...t, _id: t.id })),
    })))
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function setItem(idx, k, v) {
    setItems(its => its.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [k]: v }
      if (k === 'product_name') {
        const prev = productSuggestions.find(p => p.name === v)
        if (prev) { updated.product_category = prev.category || ''; updated.unit = prev.unit || 'sc' }
        if (updated.product_category !== 'Semente') updated.tsi = []
      }
      if (k === 'product_category' && v !== 'Semente') updated.tsi = []
      return updated
    }))
  }

  function addItem()       { setItems(its => [...its, emptyItem()]) }
  function removeItem(idx) { setItems(its => its.filter((_, i) => i !== idx)) }

  function addTsi(itemIdx) {
    setItems(its => its.map((it, i) => i !== itemIdx ? it : { ...it, tsi: [...it.tsi, emptyTsi()] }))
  }
  function removeTsi(itemIdx, tsiIdx) {
    setItems(its => its.map((it, i) => i !== itemIdx ? it : { ...it, tsi: it.tsi.filter((_, j) => j !== tsiIdx) }))
  }
  function setTsiField(itemIdx, tsiIdx, k, v) {
    setItems(its => its.map((it, i) => {
      if (i !== itemIdx) return it
      return {
        ...it,
        tsi: it.tsi.map((t, j) => {
          if (j !== tsiIdx) return t
          const updated = { ...t, [k]: v }
          if (k === 'tsi_name') {
            const cat = tsiCatalog.find(c => c.name === v)
            if (cat) { updated.unit = cat.unit; updated.unit_cost = cat.base_cost || '' }
          }
          return updated
        }),
      }
    }))
  }

  // Totals
  const totals = items.reduce((acc, it) => {
    const qty = Number(it.quantity) || 0
    const fp  = Number(it.unit_price) * (1 - (Number(it.discount_pct) || 0) / 100)
    acc.revenue += qty * fp
    acc.cost    += qty * (Number(it.unit_cost) || 0)
    acc.freight += qty * (Number(it.unit_freight) || 0)
    it.tsi.forEach(t => {
      acc.revenue += (Number(t.quantity) || 0) * (Number(t.unit_price) || 0)
      acc.cost    += (Number(t.quantity) || 0) * (Number(t.unit_cost)  || 0)
    })
    return acc
  }, { revenue: 0, cost: 0, freight: 0 })

  const freightTotal = totals.freight
  const commission   = totals.revenue * (Number(form.commission_pct) || 0) / 100
  const grossMargin  = totals.revenue ? ((totals.revenue - totals.cost) / totals.revenue) * 100 : 0
  const netMargin    = totals.revenue ? ((totals.revenue - totals.cost - freightTotal - commission) / totals.revenue) * 100 : 0

  async function handleSave(statusOverride) {
    setError('')

    // Guard: get seller ID — fallback to auth user if context not loaded yet
    let sellerId = seller?.id
    if (!sellerId) {
      const { data: { user } } = await supabase.auth.getUser()
      sellerId = user?.id
    }
    if (!sellerId) return setError("Sessao expirada. Faca login novamente.")
    if (!form.client_name?.trim()) return setError('Digite o nome do cliente.')

    const validItems = items.filter(i => i.product_name?.trim() && i.quantity && i.unit_price)
    if (validItems.length === 0) return setError('Adicione pelo menos um produto com quantidade e preço.')

    setSaving(true)
    try {
      const payload = {
        client_id:        null,
        client_name_free: form.client_name.trim(),
        seller_id:        sellerId,
        freight:          0,
        payment_date:     form.payment_date || null,
        commission_pct:   Number(form.commission_pct) || 0,
        notes:            form.notes || '',
        ...(statusOverride ? { status: statusOverride } : {}),
      }

      let quotationId = editId
      if (isEdit) {
        const { error: upErr } = await supabase.from('quotations').update(payload).eq('id', editId)
        if (upErr) throw upErr
        await supabase.from('quotation_items').delete().eq('quotation_id', editId)
      } else {
        const { data: q, error: qErr } = await supabase.from('quotations').insert(payload).select().single()
        if (qErr) throw qErr
        quotationId = q.id
      }

      const itemsPayload = validItems.map(i => ({
        quotation_id:          quotationId,
        product_id:            null,
        product_name_free:     i.product_name.trim(),
        product_category_free: i.product_category || null,
        unit:                  i.unit,
        quantity:              Number(i.quantity),
        unit_cost:             Number(i.unit_cost) || 0,
        unit_price:            Number(i.unit_price),
        discount_pct:          Number(i.discount_pct) || 0,
        unit_freight:          Number(i.unit_freight) || 0,
      }))

      const { data: savedItems, error: iErr } = await supabase
        .from('quotation_items').insert(itemsPayload).select()
      if (iErr) throw iErr

      // TSI — match by index (validItems[i] → savedItems[i])
      const tsiRecords = []
      savedItems.forEach((savedItem, idx) => {
        const original = validItems[idx]
        if (!original) return
        ;(original.tsi || []).forEach(t => {
          if (t.tsi_name?.trim() && t.quantity && t.unit_price != null) {
            tsiRecords.push({
              quotation_item_id: savedItem.id,
              tsi_name:   t.tsi_name.trim(),
              quantity:   Number(t.quantity),
              unit:       t.unit || 'L',
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

      await supabase.from('quotation_history').insert({
        quotation_id: quotationId,
        seller_id:    sellerId,
        new_status:   statusOverride || 'rascunho',
        note:         isEdit ? 'Cotação editada' : 'Cotação criada',
      })

      navigate(`/cotacoes/${quotationId}`)
    } catch (e) {
      console.error(e)
      setError(e.message || 'Erro ao salvar. Tente novamente.')
      setSaving(false)
    }
  }

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
          <div className="stack">
            {/* Header */}
            <div className="card">
              <div className="card-header"><span className="card-title">Dados da cotação</span></div>
              <div className="card-body">
                <div className="form-grid form-grid-2">
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Cliente *</label>
                    <Autocomplete
                      value={form.client_name}
                      onChange={v => setF('client_name', v)}
                      suggestions={clientSuggestions}
                      placeholder="Digite o nome do cliente…"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Data de Pagamento</label>
                    <input className="form-control" type="date"
                      value={form.payment_date}
                      onChange={e => setF('payment_date', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Comissão (%)</label>
                    <input className="form-control" type="number" min="0" max="100" step="0.1"
                      placeholder="0,0" value={form.commission_pct}
                      onChange={e => setF('commission_pct', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1/-1' }}>
                    <label className="form-label">Observações</label>
                    <textarea className="form-control" rows={2} value={form.notes}
                      onChange={e => setF('notes', e.target.value)}
                      placeholder="Condições, prazo, entrega, etc." />
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
                    productSuggestions={productSuggestions}
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

          {/* Summary */}
          <div className="card" style={{ position: 'sticky', top: 16 }}>
            <div className="card-header"><span className="card-title">Resumo</span></div>
            <div className="card-body">
              <div className="stack" style={{ gap: 11 }}>
                <SummaryRow label="Receita total"    value={fmtBRL(totals.revenue)} bold />
                <SummaryRow label="Custo (produtos)" value={fmtBRL(totals.cost)} />
                <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
                  <SummaryRow label="Frete dos itens" value={fmtBRL(totals.freight)} />
                  
                  <div style={{ borderTop: '1px solid var(--border-light)', marginTop: 6, paddingTop: 6 }}>
                    <SummaryRow label="Frete (itens)" value={fmtBRL(freightTotal)} bold />
                  </div>
                </div>
                <SummaryRow label="Comissão" value={fmtBRL(commission)} />
                <div className="divider" style={{ margin: '2px 0' }} />
                <SummaryRow label="Margem bruta"
                  value={<span className={`margin-pill ${grossMargin >= 0 ? 'margin-pos' : 'margin-neg'}`}>{fmtPct(grossMargin)}</span>} bold />
                <SummaryRow label="Margem líquida"
                  value={<span className={`margin-pill ${netMargin >= 0 ? 'margin-pos' : 'margin-neg'}`}>{fmtPct(netMargin)}</span>} bold />
                <p style={{ fontSize: '.7rem', color: 'var(--text-3)', marginTop: 2 }}>
                  ML = receita − custo − frete total − comissão
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Item Row ─────────────────────────────────────────────── */
function ItemRow({ item, idx, productSuggestions, tsiByType, onSetItem, onRemove, onAddTsi, onRemoveTsi, onSetTsi, showRemove }) {
  const isSeed          = item.product_category === 'Semente'
  const qty             = Number(item.quantity) || 0
  const margin          = calcMargin(Number(item.unit_price), Number(item.discount_pct), Number(item.unit_cost))
  const itemFreightTotal = qty * (Number(item.unit_freight) || 0)

  return (
    <div style={{ borderBottom: '1px solid var(--border-light)', padding: '14px 20px' }}>
      {/* Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 130px 32px', gap: 8, marginBottom: 8 }}>
        <div>
          {idx === 0 && <ColLabel>Produto</ColLabel>}
          <Autocomplete
            value={item.product_name}
            onChange={v => onSetItem(idx, 'product_name', v)}
            suggestions={productSuggestions.map(p => p.name)}
            placeholder="Nome do produto…"
          />
        </div>
        <div>
          {idx === 0 && <ColLabel>Categoria</ColLabel>}
          <select className="form-control" value={item.product_category}
            onChange={e => onSetItem(idx, 'product_category', e.target.value)}>
            <option value="">Categoria…</option>
            {['Semente','Fertilizante','Nutrição Vegetal','Adjuvante','Defensivo Agrícola','Outro'].map(c =>
              <option key={c} value={c}>{c}</option>
            )}
          </select>
        </div>
        <div>
          {idx === 0 && <ColLabel>Unidade</ColLabel>}
          <select className="form-control" value={item.unit}
            onChange={e => onSetItem(idx, 'unit', e.target.value)}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          {showRemove && (
            <button className="btn btn-sm" style={{ color: 'var(--red-600)', background: 'none', padding: 4 }}
              onClick={() => onRemove(idx)}>✕</button>
          )}
        </div>
      </div>

      {/* Row 2: Qtd | Custo unit. | Frete/un. | Preço unit. | Desc.% | Margem */}
      <div style={{ display: 'grid', gridTemplateColumns: '80px 110px 110px 110px 75px 90px', gap: 8 }}>
        <div>
          {idx === 0 && <ColLabel>Qtd</ColLabel>}
          <input className="form-control" type="number" min="0" step="any"
            value={item.quantity} onChange={e => onSetItem(idx, 'quantity', e.target.value)} />
        </div>
        <div>
          {idx === 0 && <ColLabel>Custo unit.</ColLabel>}
          <input className="form-control" type="number" min="0" step="0.01"
            placeholder="0,00" value={item.unit_cost}
            onChange={e => onSetItem(idx, 'unit_cost', e.target.value)} />
        </div>
        <div>
          {idx === 0 && (
            <ColLabel>
              Frete/un.
              {itemFreightTotal > 0 && <span style={{ color: 'var(--amber-500)', fontWeight: 400, marginLeft: 4 }}>= {fmtBRL(itemFreightTotal)}</span>}
            </ColLabel>
          )}
          {idx > 0 && itemFreightTotal > 0 && <div style={{ fontSize: '.7rem', color: 'var(--amber-500)', marginBottom: 4 }}>{fmtBRL(itemFreightTotal)}</div>}
          <input className="form-control" type="number" min="0" step="0.01"
            placeholder="0,00" value={item.unit_freight}
            onChange={e => onSetItem(idx, 'unit_freight', e.target.value)} />
        </div>
        <div>
          {idx === 0 && <ColLabel>Preço unit.</ColLabel>}
          <input className="form-control" type="number" min="0" step="0.01"
            placeholder="0,00" value={item.unit_price}
            onChange={e => onSetItem(idx, 'unit_price', e.target.value)} />
        </div>
        <div>
          {idx === 0 && <ColLabel>Desc.%</ColLabel>}
          <input className="form-control" type="number" min="0" max="100" step="0.1"
            value={item.discount_pct} onChange={e => onSetItem(idx, 'discount_pct', e.target.value)} />
        </div>
        <div>
          {idx === 0 && <ColLabel>Margem (MB)</ColLabel>}
          <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
            {item.unit_price && item.unit_cost
              ? <span className={`margin-pill ${margin >= 0 ? 'margin-pos' : 'margin-neg'}`}>{fmtPct(margin)}</span>
              : <span style={{ color: 'var(--text-3)', fontSize: '.75rem' }}>—</span>
            }
          </div>
        </div>
      </div>

      {/* TSI */}
      {isSeed && (
        <div style={{ marginTop: 12, paddingLeft: 16, borderLeft: '2px solid var(--green-100)' }}>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--green-700)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              🌱 TSI — Tratamentos de Semente
            </span>
            <button className="btn btn-sm"
              style={{ color: 'var(--green-700)', background: 'var(--green-50)', border: '1px solid var(--green-100)', fontSize: '.75rem' }}
              onClick={() => onAddTsi(idx)}>+ Adicionar tratamento</button>
          </div>
          {item.tsi.length === 0 && (
            <p style={{ fontSize: '.8rem', color: 'var(--text-3)', padding: '4px 0' }}>Nenhum tratamento adicionado ainda.</p>
          )}
          {item.tsi.map((t, tIdx) => (
            <TsiRow key={t._id} tsi={t} tIdx={tIdx} itemIdx={idx}
              tsiByType={tsiByType} onSet={onSetTsi} onRemove={onRemoveTsi} />
          ))}
        </div>
      )}
    </div>
  )
}

function TsiRow({ tsi, tIdx, itemIdx, tsiByType, onSet, onRemove }) {
  const margin = tsi.unit_price > 0
    ? ((Number(tsi.unit_price) - Number(tsi.unit_cost)) / Number(tsi.unit_price) * 100) : null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 70px 110px 110px 80px 32px', gap: 6, alignItems: 'center', marginBottom: 6 }}>
      <select className="form-control" style={{ fontSize: '.8125rem' }}
        value={tsi.tsi_name} onChange={e => onSet(itemIdx, tIdx, 'tsi_name', e.target.value)}>
        <option value="">Selecione o tratamento…</option>
        {Object.entries(tsiByType).map(([type, items]) => (
          <optgroup key={type} label={type}>
            {items.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </optgroup>
        ))}
      </select>
      <input className="form-control" type="number" min="0" step="any" placeholder="Qtd"
        style={{ fontSize: '.8125rem' }} value={tsi.quantity}
        onChange={e => onSet(itemIdx, tIdx, 'quantity', e.target.value)} />
      <input className="form-control" placeholder="Un."
        style={{ fontSize: '.8125rem' }} value={tsi.unit}
        onChange={e => onSet(itemIdx, tIdx, 'unit', e.target.value)} />
      <input className="form-control" type="number" min="0" step="0.01" placeholder="Custo"
        style={{ fontSize: '.8125rem' }} value={tsi.unit_cost}
        onChange={e => onSet(itemIdx, tIdx, 'unit_cost', e.target.value)} />
      <input className="form-control" type="number" min="0" step="0.01" placeholder="Preço"
        style={{ fontSize: '.8125rem' }} value={tsi.unit_price}
        onChange={e => onSet(itemIdx, tIdx, 'unit_price', e.target.value)} />
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {margin != null
          ? <span className={`margin-pill ${margin >= 0 ? 'margin-pos' : 'margin-neg'}`} style={{ fontSize: '.7rem' }}>{fmtPct(margin)}</span>
          : <span style={{ color: 'var(--text-3)', fontSize: '.75rem' }}>—</span>}
      </div>
      <button className="btn btn-sm" style={{ color: 'var(--red-600)', background: 'none', padding: 4 }}
        onClick={() => onRemove(itemIdx, tIdx)}>✕</button>
    </div>
  )
}

function Autocomplete({ value, onChange, suggestions, placeholder }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const filtered = value
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s !== value)
    : suggestions
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input className="form-control" value={value} placeholder={placeholder} autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)} />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 999, top: '100%', left: 0, right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-md)',
          maxHeight: 200, overflowY: 'auto', marginTop: 2,
        }}>
          {filtered.slice(0, 12).map(s => (
            <div key={s}
              style={{ padding: '8px 12px', fontSize: '.875rem', cursor: 'pointer', color: 'var(--text-2)' }}
              onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false) }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function ColLabel({ children }) {
  return <div style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{children}</div>
}
function SummaryRow({ label, value, bold }) {
  return (
    <div className="row-between">
      <span style={{ fontSize: '.8125rem', color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontSize: bold ? '.9375rem' : '.875rem', fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  )
}
