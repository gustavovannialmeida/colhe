import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { fmtDate } from '../lib/helpers'

const STATUS_LABEL = { pendente: 'Pendente', concluido: 'Concluído' }

const emptyForm = () => ({
  client_name: '', last_contact_date: '', last_contact_notes: '',
  next_contact_date: '', next_contact_notes: '', status: 'pendente',
})

export default function Meetings() {
  const { seller } = useAuth()
  const isAdmin    = seller?.role === 'admin'

  const [rows, setRows]         = useState([])
  const [sellers, setSellers]   = useState([])
  const [clientSugg, setClientSugg] = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)  // null | 'new' | 'edit'
  const [form, setForm]         = useState(emptyForm())
  const [saving, setSaving]     = useState(false)
  const [filters, setFilters]   = useState({ status: 'pendente', seller_id: '' })

  useEffect(() => { load() }, [filters])
  useEffect(() => { if (isAdmin) loadSellers() }, [isAdmin])
  useEffect(() => { loadClientSugg() }, [])

  async function load() {
    setLoading(true)
    let q = supabase.from('meetings').select('*, seller:sellers(name)').order('next_contact_date', { ascending: true, nullsFirst: false })
    if (filters.status)    q = q.eq('status', filters.status)
    if (filters.seller_id) q = q.eq('seller_id', filters.seller_id)
    const { data } = await q
    setRows(data || [])
    setLoading(false)
  }

  async function loadSellers() {
    const { data } = await supabase.from('sellers').select('id, name').eq('active', true).order('name')
    setSellers(data || [])
  }

  async function loadClientSugg() {
    const [{ data: clients }, { data: prevMeetings }, { data: prevQuots }] = await Promise.all([
      supabase.from('clients').select('name'),
      supabase.from('meetings').select('client_name'),
      supabase.from('quotations').select('client_name_free').not('client_name_free', 'is', null),
    ])
    const names = new Set([
      ...(clients || []).map(c => c.name),
      ...(prevMeetings || []).map(m => m.client_name),
      ...(prevQuots || []).map(q => q.client_name_free).filter(Boolean),
    ])
    setClientSugg([...names].sort())
  }

  function openNew()   { setForm(emptyForm()); setModal('new') }
  function openEdit(r) { setForm({ ...r, last_contact_date: r.last_contact_date || '', next_contact_date: r.next_contact_date || '' }); setModal('edit') }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.client_name?.trim()) return alert('Nome do cliente é obrigatório.')
    if (!seller?.id) return alert('Sessão expirada.')
    setSaving(true)
    const payload = {
      client_name:         form.client_name.trim(),
      last_contact_date:   form.last_contact_date || null,
      last_contact_notes:  form.last_contact_notes || null,
      next_contact_date:   form.next_contact_date || null,
      next_contact_notes:  form.next_contact_notes || null,
      status:              form.status || 'pendente',
      seller_id:           seller.id,
    }
    const { error } = modal === 'new'
      ? await supabase.from('meetings').insert(payload)
      : await supabase.from('meetings').update(payload).eq('id', form.id)
    if (error) { alert('Erro: ' + error.message); setSaving(false); return }
    await load(); setModal(null); setSaving(false)
  }

  async function conclude(id) {
    await supabase.from('meetings').update({ status: 'concluido' }).eq('id', id)
    await load()
  }

  async function del(id) {
    if (!confirm('Excluir este agendamento?')) return
    await supabase.from('meetings').delete().eq('id', id)
    await load()
  }

  // Group by overdue / today / upcoming / no date
  const today = new Date().toISOString().split('T')[0]
  const overdue  = rows.filter(r => r.next_contact_date && r.next_contact_date < today && r.status === 'pendente')
  const dueToday = rows.filter(r => r.next_contact_date === today && r.status === 'pendente')
  const upcoming = rows.filter(r => r.next_contact_date && r.next_contact_date > today && r.status === 'pendente')
  const noDate   = rows.filter(r => !r.next_contact_date && r.status === 'pendente')
  const done     = rows.filter(r => r.status === 'concluido')

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Reuniões & Acompanhamento</h2>
          <p className="text-muted" style={{ marginTop: 4 }}>
            Registre contatos e programe retornos com clientes
          </p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Novo registro</button>
      </div>

      <div className="page-body stack">
        {/* Filters */}
        <div className="filters-bar">
          <button className={`btn btn-sm ${filters.status === 'pendente' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilters(f => ({ ...f, status: 'pendente' }))}>
            Pendentes
          </button>
          <button className={`btn btn-sm ${filters.status === 'concluido' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilters(f => ({ ...f, status: 'concluido' }))}>
            Concluídos
          </button>
          <button className={`btn btn-sm ${!filters.status ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilters(f => ({ ...f, status: '' }))}>
            Todos
          </button>
          {isAdmin && (
            <select className="form-control" style={{ width: 'auto' }}
              value={filters.seller_id} onChange={e => setFilters(f => ({ ...f, seller_id: e.target.value }))}>
              <option value="">Todos os vendedores</option>
              {sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        {loading ? <p className="text-muted">Carregando…</p> : rows.length === 0 ? (
          <div className="empty-state">
            <span style={{ fontSize: '2rem' }}>📅</span>
            <p>Nenhum registro encontrado.</p>
          </div>
        ) : (
          <>
            {/* Overdue */}
            {overdue.length > 0 && (
              <MeetingGroup title="⚠️ Atrasados" color="var(--red-600)" bg="var(--red-100)"
                rows={overdue} isAdmin={isAdmin} onEdit={openEdit} onConclude={conclude} onDelete={del} />
            )}

            {/* Today */}
            {dueToday.length > 0 && (
              <MeetingGroup title="📌 Para hoje" color="var(--amber-600)" bg="var(--amber-100)"
                rows={dueToday} isAdmin={isAdmin} onEdit={openEdit} onConclude={conclude} onDelete={del} />
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <MeetingGroup title="🗓 Próximos contatos" color="var(--blue-600)" bg="var(--blue-100)"
                rows={upcoming} isAdmin={isAdmin} onEdit={openEdit} onConclude={conclude} onDelete={del} />
            )}

            {/* No date */}
            {noDate.length > 0 && (
              <MeetingGroup title="📋 Sem data definida" color="var(--text-3)" bg="var(--gray-100)"
                rows={noDate} isAdmin={isAdmin} onEdit={openEdit} onConclude={conclude} onDelete={del} />
            )}

            {/* Done */}
            {done.length > 0 && filters.status !== 'pendente' && (
              <MeetingGroup title="✅ Concluídos" color="var(--green-700)" bg="var(--green-100)"
                rows={done} isAdmin={isAdmin} onEdit={openEdit} onConclude={conclude} onDelete={del} done />
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 580 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modal === 'new' ? 'Novo registro' : 'Editar registro'}</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body stack">
              <div className="form-group">
                <label className="form-label">Cliente *</label>
                <Autocomplete
                  value={form.client_name}
                  onChange={v => setF('client_name', v)}
                  suggestions={clientSugg}
                  placeholder="Nome do cliente…"
                />
              </div>

              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label className="form-label">Data do último contato</label>
                  <input className="form-control" type="date" value={form.last_contact_date}
                    onChange={e => setF('last_contact_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-control" value={form.status}
                    onChange={e => setF('status', e.target.value)}>
                    <option value="pendente">Pendente</option>
                    <option value="concluido">Concluído</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Resumo do último contato</label>
                <textarea className="form-control" rows={3} value={form.last_contact_notes}
                  onChange={e => setF('last_contact_notes', e.target.value)}
                  placeholder="O que foi discutido, interesse do cliente, produtos mencionados…" />
              </div>

              <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: 16 }}>
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label">📅 Previsão do próximo contato</label>
                  <input className="form-control" type="date" value={form.next_contact_date}
                    onChange={e => setF('next_contact_date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Pauta do próximo contato</label>
                  <textarea className="form-control" rows={2} value={form.next_contact_notes}
                    onChange={e => setF('next_contact_notes', e.target.value)}
                    placeholder="O que precisa ser abordado, proposta a enviar, etc." />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ── Meeting Group ────────────────────────────────────────── */
function MeetingGroup({ title, color, bg, rows, isAdmin, onEdit, onConclude, onDelete, done }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: '.8125rem', fontWeight: 700, color, background: bg, padding: '3px 10px', borderRadius: 99 }}>
          {title}
        </span>
        <span style={{ fontSize: '.75rem', color: 'var(--text-3)' }}>{rows.length}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
        {rows.map(r => (
          <MeetingCard key={r.id} row={r} isAdmin={isAdmin}
            onEdit={onEdit} onConclude={onConclude} onDelete={onDelete} done={done} />
        ))}
      </div>
    </div>
  )
}

/* ── Meeting Card ─────────────────────────────────────────── */
function MeetingCard({ row, isAdmin, onEdit, onConclude, onDelete, done }) {
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = row.next_contact_date && row.next_contact_date < today && row.status === 'pendente'
  const isToday   = row.next_contact_date === today

  return (
    <div className="card" style={{
      padding: '16px 18px',
      borderLeft: `3px solid ${isOverdue ? 'var(--red-600)' : isToday ? 'var(--amber-500)' : done ? 'var(--green-600)' : 'var(--border)'}`,
    }}>
      {/* Header */}
      <div className="row-between" style={{ marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: '.9375rem', color: 'var(--text-1)' }}>{row.client_name}</span>
        {isAdmin && row.seller && (
          <span style={{ fontSize: '.75rem', color: 'var(--text-3)' }}>{row.seller.name}</span>
        )}
      </div>

      {/* Last contact */}
      {(row.last_contact_date || row.last_contact_notes) && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>
            Último contato {row.last_contact_date ? `· ${fmtDate(row.last_contact_date)}` : ''}
          </div>
          {row.last_contact_notes && (
            <p style={{ fontSize: '.8125rem', color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
              {row.last_contact_notes}
            </p>
          )}
        </div>
      )}

      {/* Next contact */}
      {(row.next_contact_date || row.next_contact_notes) && (
        <div style={{
          background: isOverdue ? 'var(--red-100)' : isToday ? 'var(--amber-100)' : 'var(--bg)',
          borderRadius: 'var(--radius-sm)', padding: '8px 10px', marginBottom: 10,
        }}>
          <div style={{ fontSize: '.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3,
            color: isOverdue ? 'var(--red-600)' : isToday ? 'var(--amber-600)' : 'var(--text-3)' }}>
            {isOverdue ? '⚠️ Retorno atrasado' : isToday ? '📌 Contatar hoje' : '📅 Próximo contato'}
            {row.next_contact_date ? ` · ${fmtDate(row.next_contact_date)}` : ''}
          </div>
          {row.next_contact_notes && (
            <p style={{ fontSize: '.8125rem', color: 'var(--text-2)', lineHeight: 1.5, margin: 0 }}>
              {row.next_contact_notes}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      {!done && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => onEdit(row)}>
            Editar
          </button>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => onConclude(row.id)}>
            ✓ Concluir
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(row.id)}>✕</button>
        </div>
      )}
      {done && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => onEdit(row)}>Editar</button>
          <button className="btn btn-danger btn-sm" onClick={() => onDelete(row.id)}>Excluir</button>
        </div>
      )}
    </div>
  )
}

/* ── Autocomplete ─────────────────────────────────────────── */
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
          {filtered.slice(0, 10).map(s => (
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
