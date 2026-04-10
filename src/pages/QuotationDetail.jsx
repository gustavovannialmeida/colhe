import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtBRL, fmtPct, fmtDate, fmtDatetime, STATUS_LABELS } from '../lib/helpers'

const NEXT_STATUSES = {
  rascunho:      ['enviada'],
  enviada:       ['em_negociacao', 'fechada', 'perdida'],
  em_negociacao: ['fechada', 'perdida'],
  fechada:       [],
  perdida:       [],
}

const STATUS_BTN = {
  enviada:       { label: 'Marcar como Enviada',        cls: 'btn-secondary' },
  em_negociacao: { label: 'Em Negociação',              cls: 'btn-amber' },
  fechada:       { label: '✓ Fechar negócio',           cls: 'btn-primary' },
  perdida:       { label: '✕ Marcar como Perdida',      cls: 'btn-danger' },
}

export default function QuotationDetail() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { seller } = useAuth()

  const [quot, setQuot]         = useState(null)
  const [items, setItems]       = useState([])
  const [history, setHistory]   = useState([])
  const [lostReasons, setLostReasons] = useState([])
  const [loading, setLoading]   = useState(true)

  const [modal, setModal]       = useState(null) // { type: 'lost' | 'status', toStatus }
  const [lostReason, setLostReason] = useState('')
  const [lostNote, setLostNote] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [transitioning, setTransitioning] = useState(false)

  const [uploadingItem, setUploadingItem] = useState(null) // { itemId, type: 'purchase'|'sale' }

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const [{ data: q }, { data: qi }, { data: h }, { data: lr }] = await Promise.all([
      supabase.from('v_quotation_summary').select('*').eq('id', id).single(),
      supabase.from('quotation_items').select('*, product:products(name, category)').eq('quotation_id', id),
      supabase.from('quotation_history').select('*, seller:sellers(name)').eq('quotation_id', id).order('changed_at', { ascending: false }),
      supabase.from('lost_reasons').select('*'),
    ])
    setQuot(q)
    setItems(qi || [])
    setHistory(h || [])
    setLostReasons(lr || [])
    setLoading(false)
  }

  async function transition(toStatus) {
    setTransitioning(true)
    try {
      const update = { status: toStatus }
      if (toStatus === 'fechada')  update.closed_at = new Date().toISOString()
      if (toStatus === 'enviada')  update.sent_at   = new Date().toISOString()
      if (toStatus === 'perdida') {
        update.lost_reason_id = lostReason || null
        update.lost_notes     = lostNote || null
      }

      await supabase.from('quotations').update(update).eq('id', id)
      await supabase.from('quotation_history').insert({
        quotation_id: id,
        seller_id: seller.id,
        previous_status: quot.status,
        new_status: toStatus,
        note: toStatus === 'perdida' ? lostNote : statusNote,
      })

      setModal(null)
      setLostReason('')
      setLostNote('')
      setStatusNote('')
      await load()
    } finally {
      setTransitioning(false)
    }
  }

  async function handleUpload(itemId, type, file) {
    if (!file) return
    setUploadingItem({ itemId, type })
    try {
      const ext  = file.name.split('.').pop()
      const path = `${type}/${itemId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('invoices').upload(path, file, { upsert: true })
      if (upErr) throw upErr

      const col = type === 'purchase' ? 'nf_purchase_url' : 'nf_sale_url'
      await supabase.from('quotation_items').update({ [col]: path }).eq('id', itemId)
      await load()
    } catch (e) {
      alert('Erro no upload: ' + e.message)
    } finally {
      setUploadingItem(null)
    }
  }

  async function getSignedUrl(path) {
    const { data } = await supabase.storage.from('invoices').createSignedUrl(path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  if (loading) return <div className="page-body"><p className="text-muted">Carregando…</p></div>
  if (!quot)   return <div className="page-body"><p className="text-muted">Cotação não encontrada.</p></div>

  const nextStatuses = NEXT_STATUSES[quot.status] || []
  const canEdit      = ['rascunho','enviada','em_negociacao'].includes(quot.status)

  return (
    <>
      <div className="page-header">
        <div>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/cotacoes')} style={{ marginBottom: 8 }}>
            ← Cotações
          </button>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <h2>{quot.code}</h2>
            <span className={`badge badge-${quot.status}`} style={{ fontSize: '.875rem', padding: '4px 12px' }}>
              {STATUS_LABELS[quot.status]}
            </span>
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {canEdit && (
            <button className="btn btn-secondary" onClick={() => navigate(`/cotacoes/nova?edit=${id}`)}>
              Editar
            </button>
          )}
          {nextStatuses.map(s => (
            <button key={s} className={`btn ${STATUS_BTN[s].cls}`}
              onClick={() => setModal({ type: s === 'perdida' ? 'lost' : 'status', toStatus: s })}>
              {STATUS_BTN[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body stack">
        {/* Info cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
          <InfoCard label="Cliente"   value={quot.client_name} sub={quot.city ? `${quot.city}/${quot.state}` : undefined} />
          <InfoCard label="Vendedor"  value={quot.seller_name} />
          <InfoCard label="Criada em" value={fmtDate(quot.created_at)} />
          {quot.sent_at   && <InfoCard label="Enviada em"  value={fmtDate(quot.sent_at)} />}
          {quot.closed_at && <InfoCard label="Fechada em"  value={fmtDate(quot.closed_at)} />}
          {quot.lost_reason && <InfoCard label="Motivo da perda" value={quot.lost_reason} sub={quot.lost_notes} color="red" />}
        </div>

        {/* Financial summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
          {[
            { label: 'Receita total', value: fmtBRL(quot.total_revenue) },
            { label: 'Custo total',   value: fmtBRL(quot.total_cost) },
            { label: 'Frete',         value: fmtBRL(quot.freight) },
            { label: 'Margem bruta',  value: fmtPct(quot.gross_margin_pct), type: 'margin', v: quot.gross_margin_pct },
            { label: 'Margem líquida',value: fmtPct(quot.net_margin_pct),  type: 'margin', v: quot.net_margin_pct },
          ].map(({ label, value, type, v }) => (
            <div key={label} className="kpi-card" style={{ padding: '16px 18px' }}>
              <div className="kpi-label">{label}</div>
              {type === 'margin'
                ? <span className={`margin-pill ${(v||0) >= 0 ? 'margin-pos' : 'margin-neg'}`} style={{ fontSize: '1.1rem', padding: '4px 12px' }}>{value}</span>
                : <div className="kpi-value" style={{ fontSize: '1.25rem' }}>{value}</div>
              }
            </div>
          ))}
        </div>

        {/* Items */}
        <div className="card">
          <div className="card-header"><span className="card-title">Produtos</span></div>
          <div className="card-body" style={{ padding: '12px 0 0', overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Produto</th><th>Qtd</th><th>Un.</th>
                  <th>Custo unit.</th><th>Preço unit.</th><th>Desc.%</th>
                  <th>Preço final</th><th>Total</th><th>MB</th>
                  <th>NF Compra</th><th>NF Venda</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const fp = Number(it.final_price) || 0
                  const total = fp * Number(it.quantity)
                  const isUpPurch = uploadingItem?.itemId === it.id && uploadingItem?.type === 'purchase'
                  const isUpSale  = uploadingItem?.itemId === it.id && uploadingItem?.type === 'sale'
                  return (
                    <tr key={it.id}>
                      <td className="td-strong">{it.product?.name}</td>
                      <td>{it.quantity}</td>
                      <td>{it.unit}</td>
                      <td>{fmtBRL(it.unit_cost)}</td>
                      <td>{fmtBRL(it.unit_price)}</td>
                      <td>{it.discount_pct > 0 ? `${it.discount_pct}%` : '—'}</td>
                      <td>{fmtBRL(fp)}</td>
                      <td className="td-strong">{fmtBRL(total)}</td>
                      <td>
                        <span className={`margin-pill ${Number(it.gross_margin) >= 0 ? 'margin-pos' : 'margin-neg'}`}>
                          {fmtPct(it.gross_margin)}
                        </span>
                      </td>
                      <td>
                        <NFCell path={it.nf_purchase_url} loading={isUpPurch}
                          onUpload={f => handleUpload(it.id, 'purchase', f)}
                          onView={() => getSignedUrl(it.nf_purchase_url)} />
                      </td>
                      <td>
                        <NFCell path={it.nf_sale_url} loading={isUpSale}
                          onUpload={f => handleUpload(it.id, 'sale', f)}
                          onView={() => getSignedUrl(it.nf_sale_url)} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes */}
        {quot.notes && (
          <div className="card">
            <div className="card-header"><span className="card-title">Observações</span></div>
            <div className="card-body" style={{ whiteSpace: 'pre-wrap', fontSize: '.875rem', color: 'var(--text-2)' }}>
              {quot.notes}
            </div>
          </div>
        )}

        {/* History */}
        <div className="card">
          <div className="card-header"><span className="card-title">Histórico</span></div>
          <div className="card-body">
            {history.length === 0 ? (
              <p className="text-muted">Sem registros de alteração.</p>
            ) : (
              <div className="history-list">
                {history.map(h => (
                  <div key={h.id} className="history-item">
                    <div className="history-dot" />
                    <div>
                      <div className="history-text">
                        {h.previous_status
                          ? <>
                              <span className={`badge badge-${h.previous_status}`}>{STATUS_LABELS[h.previous_status]}</span>
                              {' → '}
                              <span className={`badge badge-${h.new_status}`}>{STATUS_LABELS[h.new_status]}</span>
                            </>
                          : <span className={`badge badge-${h.new_status}`}>{STATUS_LABELS[h.new_status]}</span>
                        }
                        {h.note && <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>— {h.note}</span>}
                      </div>
                      <div className="history-time">{h.seller?.name} · {fmtDatetime(h.changed_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status transition modal */}
      {modal?.type === 'status' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirmar: {STATUS_LABELS[modal.toStatus]}</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Observação (opcional)</label>
                <textarea className="form-control" rows={3} value={statusNote}
                  onChange={e => setStatusNote(e.target.value)} placeholder="Ex: cliente confirmou recebimento…" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className={`btn ${STATUS_BTN[modal.toStatus]?.cls || 'btn-primary'}`}
                onClick={() => transition(modal.toStatus)} disabled={transitioning}>
                {transitioning ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lost modal */}
      {modal?.type === 'lost' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Marcar como Perdida</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body stack">
              <div className="form-group">
                <label className="form-label">Motivo *</label>
                <select className="form-control" value={lostReason} onChange={e => setLostReason(e.target.value)}>
                  <option value="">Selecione o motivo…</option>
                  {lostReasons.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Detalhes</label>
                <textarea className="form-control" rows={3} value={lostNote}
                  onChange={e => setLostNote(e.target.value)} placeholder="Descreva o que aconteceu…" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-danger"
                onClick={() => transition('perdida')} disabled={transitioning || !lostReason}>
                {transitioning ? 'Salvando…' : 'Confirmar perda'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function InfoCard({ label, value, sub, color }) {
  return (
    <div className="kpi-card" style={{ padding: '16px 18px' }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{
        fontSize: '1rem', fontFamily: 'var(--font-body)', fontWeight: 600,
        color: color === 'red' ? 'var(--red-600)' : 'var(--text-1)'
      }}>{value || '—'}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

function NFCell({ path, loading, onUpload, onView }) {
  if (loading) return <span className="text-muted" style={{ fontSize: '.75rem' }}>Enviando…</span>

  if (path) {
    return (
      <button className="upload-link" onClick={onView} style={{ display: 'block' }}>
        📄 Ver NF
      </button>
    )
  }

  return (
    <label className="upload-zone" style={{ minWidth: 90, cursor: 'pointer' }}>
      📎 Anexar
      <input type="file" accept=".pdf,.xml,.png,.jpg,.jpeg" style={{ display: 'none' }}
        onChange={e => onUpload(e.target.files[0])} />
    </label>
  )
}
