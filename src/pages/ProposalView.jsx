import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fmtBRL, fmtDate } from '../lib/helpers'

export default function ProposalView() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const [quot, setQuot]   = useState(null)
  const [items, setItems] = useState([])
  const [seller, setSeller] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [id])

  async function load() {
    const [{ data: qs }, { data: qd }, { data: qi }] = await Promise.all([
      supabase.from('v_quotation_summary').select('*').eq('id', id).single(),
      supabase.from('quotations').select('payment_date, notes').eq('id', id).single(),
      supabase.from('quotation_items')
        .select('*, tsi:quotation_item_tsi(*)').eq('quotation_id', id),
    ])
    const q = qs ? { ...qs, payment_date: qd?.payment_date, notes: qd?.notes || qs?.notes } : null
    setQuot(q)
    setItems(qi || [])
    if (q?.seller_id) {
      const { data: s } = await supabase.from('sellers').select('name, email').eq('id', q.seller_id).single()
      setSeller(s)
    }
    setLoading(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}>Carregando…</div>
  if (!quot)   return <div style={{ padding: 40 }}>Cotação não encontrada.</div>

  const freightItems = items.reduce((s, i) => s + Number(i.quantity) * (Number(i.unit_freight) || 0), 0)
  const freightExtra = Number(quot.freight_extra) || 0
  const freightTotal = freightItems + freightExtra
  const hasFreight   = freightTotal > 0

  const totalProducts = items.reduce((s, i) => {
    const fp = Number(i.final_price) || Number(i.unit_price)
    return s + Number(i.quantity) * fp
  }, 0)

  const totalTSI = items.reduce((s, i) => {
    return s + (i.tsi || []).reduce((ts, t) => ts + Number(t.quantity) * Number(t.unit_price), 0)
  }, 0)

  const totalRevenue = totalProducts + totalTSI

  return (
    <>
      {/* Print controls — hidden on print */}
      <div className="no-print" style={{
        background: 'var(--green-800)', padding: '12px 24px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button className="btn btn-secondary btn-sm" onClick={() => navigate(-1)}>← Voltar</button>
        <span style={{ color: 'white', fontFamily: 'var(--font-display)', fontSize: '1.1rem', flex: 1 }}>
          Proposta Comercial — {quot.code}
        </span>
        <button className="btn btn-amber" onClick={() => {
          const date = new Date(quot.created_at).toLocaleDateString('pt-BR').replace(/\//g, '-')
          const client = quot.client_name?.replace(/[^a-zA-Z0-9À-ú\s]/g, '').trim() || 'Cliente'
          const prev = document.title
          document.title = `Proposta ${client} ${date}`
          window.print()
          document.title = prev
        }}>
          🖨 Imprimir / Salvar PDF
        </button>
      </div>

      <div className="proposal">
        {/* Header */}
        <div className="p-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <img
              src="/logo-novaciafertil.png"
              alt="NovaCiafértil"
              style={{ height: 56, objectFit: 'contain' }}
              onError={e => { e.target.style.display = 'none' }}
            />
            <div>
              <div className="p-brand">NovaCiafértil</div>
              <div className="p-brand-sub">Proposta Comercial</div>
            </div>
          </div>
          <div className="p-meta">
            <div className="p-code">{quot.code}</div>
            <div className="p-date">Data: {fmtDate(quot.created_at)}</div>
            {seller && <div className="p-date">Vendedor: {seller.name}</div>}
            {quot.payment_date && <div className="p-date" style={{ marginTop: 4, fontWeight: 600, color: '#1a4a32' }}>Pagamento: {new Date(quot.payment_date + 'T00:00:00').toLocaleDateString('pt-BR')}</div>}
          </div>
        </div>

        {/* Client */}
        <div className="p-section">
          <div className="p-section-title">Para</div>
          <div className="p-client">{quot.client_name}</div>
        </div>

        {/* Items */}
        <div className="p-section">
          <div className="p-section-title">Produtos cotados</div>
          <table className="p-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th style={{ textAlign: 'center' }}>Qtd</th>
                <th style={{ textAlign: 'center' }}>Un.</th>
                <th style={{ textAlign: 'right' }}>Preço unit.</th>
                {items.some(i => i.discount_pct > 0) && <th style={{ textAlign: 'right' }}>Desc.</th>}
                {items.some(i => i.discount_pct > 0) && <th style={{ textAlign: 'right' }}>Preço final</th>}
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const fp    = Number(it.final_price) || Number(it.unit_price)
                const total = fp * Number(it.quantity)
                const hasDiscount = it.discount_pct > 0
                const showDiscCol = items.some(i => i.discount_pct > 0)
                const isSeed = it.product_category_free === 'Semente'

                return (
                  <>
                    <tr key={it.id} className={idx % 2 === 0 ? 'p-row-even' : ''}>
                      <td>
                        <strong>{it.product_name_free}</strong>
                        {it.product_category_free && (
                          <span className="p-category">{it.product_category_free}</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>{it.quantity}</td>
                      <td style={{ textAlign: 'center' }}>{it.unit}</td>
                      <td style={{ textAlign: 'right' }}>{fmtBRL(it.unit_price)}</td>
                      {showDiscCol && <td style={{ textAlign: 'right' }}>{hasDiscount ? `${it.discount_pct}%` : '—'}</td>}
                      {showDiscCol && <td style={{ textAlign: 'right' }}>{fmtBRL(fp)}</td>}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtBRL(total)}</td>
                    </tr>
                    {/* TSI sub-rows + subtotal */}
                    {isSeed && (it.tsi || []).length > 0 && (() => {
                      const tsiUnitSum  = (it.tsi || []).reduce((s, t) => s + Number(t.unit_price), 0)
                      const tsiTotal    = (it.tsi || []).reduce((s, t) => s + Number(t.quantity) * Number(t.unit_price), 0)
                      const grandUnitPrice = fp + tsiUnitSum
                      const grandTotal     = total + tsiTotal
                      return (
                        <>
                          {(it.tsi || []).map(t => {
                            const tTotal = Number(t.quantity) * Number(t.unit_price)
                            return (
                              <tr key={t.id} className="p-tsi-row">
                                <td style={{ paddingLeft: 24 }}>
                                  <span className="p-tsi-label">↳ TSI:</span> {t.tsi_name}
                                </td>
                                <td style={{ textAlign: 'center' }}>{t.quantity}</td>
                                <td style={{ textAlign: 'center' }}>{t.unit}</td>
                                <td style={{ textAlign: 'right' }}>{fmtBRL(t.unit_price)}</td>
                                {showDiscCol && <td>—</td>}
                                {showDiscCol && <td style={{ textAlign: 'right' }}>{fmtBRL(t.unit_price)}</td>}
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtBRL(tTotal)}</td>
                              </tr>
                            )
                          })}
                          {/* Subtotal row: semente + todos os TSI */}
                          <tr className="p-tsi-subtotal-row">
                            <td style={{ paddingLeft: 24, fontStyle: 'italic', color: '#1e5c3e', fontSize: '.8rem', fontWeight: 700 }}>
                              Subtotal — {it.product_name_free}
                            </td>
                            <td style={{ textAlign: 'center', color: '#1e5c3e', fontSize: '.8rem' }}>{it.quantity}</td>
                            <td style={{ textAlign: 'center', color: '#1e5c3e', fontSize: '.8rem' }}>{it.unit}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#1e5c3e' }}>{fmtBRL(grandUnitPrice)}</td>
                            {showDiscCol && <td />}
                            {showDiscCol && <td />}
                            <td style={{ textAlign: 'right', fontWeight: 700, color: '#1e5c3e' }}>{fmtBRL(grandTotal)}</td>
                          </tr>
                        </>
                      )
                    })()}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="p-totals">
          <div className="p-totals-box">
            <div className="p-total-row">
              <span>Produtos</span>
              <span>{fmtBRL(totalProducts)}</span>
            </div>
            {totalTSI > 0 && (
              <div className="p-total-row">
                <span>Tratamentos (TSI)</span>
                <span>{fmtBRL(totalTSI)}</span>
              </div>
            )}
            {hasFreight && (
              <div className="p-total-row">
                <span>Frete</span>
                <span>{fmtBRL(freightTotal)}</span>
              </div>
            )}
            <div className="p-total-row p-total-grand">
              <span>Total Geral</span>
              <span>{fmtBRL(totalRevenue + freightTotal)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {quot.notes && (
          <div className="p-section">
            <div className="p-section-title">Observações</div>
            <div className="p-notes">{quot.notes}</div>
          </div>
        )}

        {/* Footer */}
        <div className="p-footer">
          <p>Esta proposta foi gerada em {fmtDate(quot.created_at)} e tem validade sujeita a confirmação.</p>
          {seller && <p>Contato: {seller.name}{seller.email ? ` · ${seller.email}` : ''}</p>}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        .proposal {
          max-width: 820px;
          margin: 0 auto;
          padding: 48px 48px 64px;
          background: white;
          font-family: 'Plus Jakarta Sans', sans-serif;
          color: #1a1a12;
          min-height: 100vh;
        }

        .p-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 24px;
          border-bottom: 3px solid #1a4a32;
          margin-bottom: 32px;
        }

        .p-brand {
          font-family: 'Lora', Georgia, serif;
          font-size: 2.25rem;
          font-weight: 700;
          color: #1a4a32;
          letter-spacing: -.02em;
          line-height: 1;
        }
        .p-brand-sub {
          font-size: .75rem;
          text-transform: uppercase;
          letter-spacing: .12em;
          color: #8a8578;
          margin-top: 4px;
        }

        .p-meta { text-align: right; }
        .p-code {
          font-family: 'Lora', serif;
          font-size: 1.125rem;
          font-weight: 600;
          color: #1a4a32;
        }
        .p-date { font-size: .8125rem; color: #4a4740; margin-top: 2px; }

        .p-section { margin-bottom: 28px; }
        .p-section-title {
          font-size: .6875rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .1em;
          color: #8a8578;
          margin-bottom: 8px;
          padding-bottom: 4px;
          border-bottom: 1px solid #e5e0d6;
        }

        .p-client {
          font-size: 1.375rem;
          font-family: 'Lora', serif;
          font-weight: 600;
          color: #1a1a12;
        }

        .p-table {
          width: 100%;
          border-collapse: collapse;
          font-size: .875rem;
        }
        .p-table th {
          font-size: .6875rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .07em;
          color: #8a8578;
          padding: 8px 10px;
          border-bottom: 2px solid #1a4a32;
          white-space: nowrap;
        }
        .p-table td {
          padding: 10px 10px;
          border-bottom: 1px solid #ede9e0;
          vertical-align: middle;
          color: #1a1a12;
        }
        .p-row-even td { background: #f7f5f0; }
        .p-tsi-row td {
          background: #f2faf5;
          font-size: .8125rem;
          color: #2a7a52;
          border-bottom: 1px solid #e8f4ed;
        }
        .p-tsi-subtotal-row td {
          background: #e8f4ed;
          font-size: .8125rem;
          border-bottom: 2px solid #c8e6d4;
          padding: 7px 10px;
        }
        .p-tsi-label { font-weight: 600; }
        .p-category {
          display: inline-block;
          font-size: .7rem;
          background: #e8f4ed;
          color: #1e5c3e;
          padding: 1px 7px;
          border-radius: 99px;
          margin-left: 6px;
          font-weight: 500;
        }

        .p-totals {
          display: flex;
          justify-content: flex-end;
          margin: 8px 0 32px;
        }
        .p-totals-box {
          min-width: 280px;
          border: 1px solid #e5e0d6;
          border-radius: 8px;
          overflow: hidden;
        }
        .p-total-row {
          display: flex;
          justify-content: space-between;
          padding: 9px 16px;
          font-size: .875rem;
          border-bottom: 1px solid #ede9e0;
        }
        .p-total-row:last-child { border-bottom: none; }
        .p-total-grand {
          background: #1a4a32;
          color: white;
          font-size: 1rem;
          font-weight: 700;
          padding: 12px 16px;
        }

        .p-notes {
          font-size: .875rem;
          color: #4a4740;
          line-height: 1.65;
          white-space: pre-wrap;
          background: #f7f5f0;
          border-left: 3px solid #2a7a52;
          padding: 12px 16px;
          border-radius: 0 6px 6px 0;
        }

        .p-footer {
          margin-top: 48px;
          padding-top: 20px;
          border-top: 1px solid #e5e0d6;
          font-size: .75rem;
          color: #8a8578;
          line-height: 1.6;
        }

        @media print {
          .no-print { display: none !important; }
          .proposal { padding: 24px 32px; }
          body { background: white !important; }
        }
      `}</style>
    </>
  )
}
