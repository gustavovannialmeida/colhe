import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { initials, fmtDate } from '../lib/helpers'

export default function Team() {
  const { seller: currentSeller } = useAuth()
  const isAdmin = currentSeller?.role === 'admin'

  const [sellers, setSellers]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(null)  // null | 'edit'
  const [form, setForm]         = useState({})
  const [saving, setSaving]     = useState(false)
  const [stats, setStats]       = useState({})    // { seller_id: { total, fechadas } }

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: s }, { data: q }] = await Promise.all([
      supabase.from('sellers').select('*').order('name'),
      supabase.from('v_quotation_summary').select('seller_id, seller_name, status'),
    ])
    setSellers(s || [])

    // Build stats per seller
    const map = {}
    ;(q || []).forEach(r => {
      if (!map[r.seller_id]) map[r.seller_id] = { total: 0, fechadas: 0 }
      map[r.seller_id].total++
      if (r.status === 'fechada') map[r.seller_id].fechadas++
    })
    setStats(map)
    setLoading(false)
  }

  function openEdit(s) { setForm({ ...s }); setModal('edit') }

  async function save() {
    if (!form.name?.trim()) return alert('Nome é obrigatório.')
    setSaving(true)
    const { error } = await supabase.from('sellers').update({
      name:   form.name.trim(),
      email:  form.email || '',
      role:   form.role  || 'seller',
      active: form.active !== false,
    }).eq('id', form.id)
    if (error) { alert('Erro: ' + error.message); setSaving(false); return }
    await load()
    setModal(null)
    setSaving(false)
  }

  async function toggleActive(id, active) {
    await supabase.from('sellers').update({ active }).eq('id', id)
    await load()
  }

  const active   = sellers.filter(s => s.active)
  const inactive = sellers.filter(s => !s.active)

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Equipe</h2>
          <p className="text-muted" style={{ marginTop: 4 }}>
            {active.length} membro{active.length !== 1 ? 's' : ''} ativo{active.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="page-body stack">
        {/* Invite tip */}
        <div className="alert" style={{ background: 'var(--blue-100)', color: 'var(--blue-600)' }}>
          💡 Para adicionar um membro: Supabase → Authentication → Users → <strong>Invite user</strong>. Ele aparecerá aqui após o primeiro login.
        </div>

        {loading ? <p className="text-muted">Carregando…</p> : (
          <>
            {/* Active members */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {active.map(s => {
                const st  = stats[s.id] || { total: 0, fechadas: 0 }
                const isSelf = s.id === currentSeller?.id
                const conv = st.total ? ((st.fechadas / st.total) * 100).toFixed(0) : 0

                return (
                  <div key={s.id} className="card" style={{ padding: '20px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        background: s.role === 'admin' ? 'var(--green-700)' : 'var(--amber-500)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '1rem', color: 'white', flexShrink: 0,
                      }}>
                        {initials(s.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '.9375rem', color: 'var(--text-1)' }}>
                          {s.name} {isSelf && <span style={{ fontSize: '.7rem', color: 'var(--text-3)' }}>(você)</span>}
                        </div>
                        <div style={{ fontSize: '.8125rem', color: 'var(--text-3)', marginTop: 2 }}>{s.email}</div>
                        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
                          <span className={`badge ${s.role === 'admin' ? 'badge-fechada' : 'badge-enviada'}`}>
                            {s.role === 'admin' ? 'Admin' : 'Vendedor'}
                          </span>
                          <span className="badge badge-fechada">Ativo</span>
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                      <StatMini label="Cotações" value={st.total} />
                      <StatMini label="Fechadas"  value={st.fechadas} green />
                      <StatMini label="Conversão" value={`${conv}%`} />
                    </div>

                    {/* Actions */}
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}
                          onClick={() => openEdit(s)}>
                          ✏️ Editar
                        </button>
                        {!isSelf && (
                          <button className="btn btn-danger btn-sm"
                            onClick={() => toggleActive(s.id, false)}>
                            Desativar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Inactive members */}
            {inactive.length > 0 && (
              <>
                <div style={{ marginTop: 8 }}>
                  <h3 style={{ fontSize: '1rem', color: 'var(--text-3)', marginBottom: 12 }}>
                    Inativos ({inactive.length})
                  </h3>
                  <div className="card" style={{ overflow: 'hidden' }}>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>Nome</th><th>E-mail</th><th>Papel</th><th></th></tr>
                        </thead>
                        <tbody>
                          {inactive.map(s => (
                            <tr key={s.id}>
                              <td style={{ color: 'var(--text-3)' }}>{s.name}</td>
                              <td style={{ color: 'var(--text-3)' }}>{s.email}</td>
                              <td><span className="tag">{s.role === 'admin' ? 'Admin' : 'Vendedor'}</span></td>
                              <td>
                                {isAdmin && (
                                  <div className="row">
                                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)}>Editar</button>
                                    <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(s.id, true)}>Reativar</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Edit modal */}
      {modal === 'edit' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar membro</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body stack">
              <div className="form-group">
                <label className="form-label">Nome *</label>
                <input className="form-control" value={form.name || ''}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">E-mail</label>
                <input className="form-control" type="email" value={form.email || ''}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Papel</label>
                <select className="form-control" value={form.role || 'seller'}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="seller">Vendedor</option>
                  <option value="admin">Admin</option>
                </select>
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

function StatMini({ label, value, green }) {
  return (
    <div style={{
      background: 'var(--bg)', borderRadius: 'var(--radius-sm)',
      padding: '8px 10px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.125rem', fontWeight: 700, color: green ? 'var(--green-700)' : 'var(--text-1)' }}>
        {value}
      </div>
      <div style={{ fontSize: '.6875rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {label}
      </div>
    </div>
  )
}
