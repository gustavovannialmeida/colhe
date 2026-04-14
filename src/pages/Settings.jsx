import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const CATEGORIES = [
  'Semente',
  'Fertilizante',
  'Nutrição Vegetal',
  'Adjuvante',
  'Defensivo Agrícola',
]

const UNITS = ['sc', 'sc 60.000 sem', 'big-bag 5MM', 'big-bag 2,5MM', 'kg', 'L', 'cx', 'un', 't', 'ha', 'doses']

export default function Settings() {
  const { seller } = useAuth()
  const isAdmin    = seller?.role === 'admin'
  const [tab, setTab] = useState('clients')

  return (
    <>
      <div className="page-header"><h2>Configurações</h2></div>
      <div className="page-body">
        <div className="tabs">
          <button className={`tab-btn ${tab === 'clients'  ? 'active' : ''}`} onClick={() => setTab('clients')}>Clientes</button>
          <button className={`tab-btn ${tab === 'products' ? 'active' : ''}`} onClick={() => setTab('products')}>Produtos</button>
          <button className={`tab-btn ${tab === 'tsi'      ? 'active' : ''}`} onClick={() => setTab('tsi')}>Catálogo TSI</button>
          {isAdmin && <button className={`tab-btn ${tab === 'sellers' ? 'active' : ''}`} onClick={() => setTab('sellers')}>Vendedores</button>}
        </div>
        {tab === 'clients'  && <ClientsTab />}
        {tab === 'products' && <ProductsTab />}
        {tab === 'tsi'      && <TsiCatalogTab />}
        {tab === 'sellers'  && isAdmin && <SellersTab />}
      </div>
    </>
  )
}

/* ── Clients ──────────────────────────────────────────────── */
function ClientsTab() {
  const [rows, setRows]     = useState([])
  const [modal, setModal]   = useState(null)
  const [form, setForm]     = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])
  const load = async () => {
    const { data } = await supabase.from('clients').select('*').order('name')
    setRows(data || [])
  }

  function openNew()   { setForm({ name:'', document:'', phone:'', email:'', city:'', state:'', region:'' }); setModal('new') }
  function openEdit(r) { setForm({...r}); setModal('edit') }

  async function save() {
    if (!form.name?.trim()) return alert('Nome é obrigatório.')
    setSaving(true)
    const { error } = modal === 'new'
      ? await supabase.from('clients').insert(form)
      : await supabase.from('clients').update(form).eq('id', form.id)
    if (error) { alert('Erro: ' + error.message); setSaving(false); return }
    await load(); setModal(null); setSaving(false)
  }

  async function del(id) {
    if (!confirm('Excluir cliente? Cotações existentes serão preservadas.')) return
    const { error } = await supabase.from('clients').delete().eq('id', id)
    if (error) return alert('Erro: ' + error.message)
    await load()
  }

  return (
    <div className="stack">
      <div className="row-between">
        <span className="text-muted">{rows.length} cliente{rows.length !== 1 ? 's' : ''}</span>
        <button className="btn btn-primary btn-sm" onClick={openNew}>+ Novo cliente</button>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {rows.length === 0
          ? <div className="empty-state"><p>Nenhum cliente cadastrado.</p></div>
          : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nome</th><th>CPF/CNPJ</th><th>Cidade/UF</th><th>Telefone</th><th>E-mail</th><th></th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td className="td-strong">{r.name}</td>
                      <td>{r.document || '—'}</td>
                      <td>{r.city ? `${r.city}/${r.state}` : '—'}</td>
                      <td>{r.phone || '—'}</td>
                      <td>{r.email || '—'}</td>
                      <td>
                        <div className="row">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                          <button className="btn btn-danger btn-sm" onClick={() => del(r.id)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
      {modal && (
        <CrudModal title={modal === 'new' ? 'Novo cliente' : 'Editar cliente'}
          onClose={() => setModal(null)} onSave={save} saving={saving}>
          <div className="form-grid form-grid-2">
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nome *</label>
              <input className="form-control" value={form.name || ''} autoFocus
                onChange={e => setForm(f => ({...f, name: e.target.value}))} />
            </div>
            <Field label="CPF/CNPJ" k="document" form={form} setForm={setForm} />
            <Field label="Telefone"  k="phone"    form={form} setForm={setForm} />
            <Field label="E-mail"    k="email"    form={form} setForm={setForm} type="email" />
            <Field label="Cidade"    k="city"     form={form} setForm={setForm} />
            <Field label="UF"        k="state"    form={form} setForm={setForm} placeholder="BA" />
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Região</label>
              <input className="form-control" value={form.region || ''}
                onChange={e => setForm(f => ({...f, region: e.target.value}))}
                placeholder="Ex: Oeste Bahia" />
            </div>
          </div>
        </CrudModal>
      )}
    </div>
  )
}

/* ── Products ─────────────────────────────────────────────── */
function ProductsTab() {
  const [rows, setRows]       = useState([])
  const [modal, setModal]     = useState(null)
  const [form, setForm]       = useState({})
  const [saving, setSaving]   = useState(false)
  const [filterCat, setFilterCat] = useState('')

  useEffect(() => { load() }, [])
  const load = async () => {
    const { data, error } = await supabase.from('products').select('*').order('name')
    if (error) alert('Erro ao carregar produtos: ' + error.message)
    setRows(data || [])
  }

  function openNew()   { setForm({ name:'', category:'', unit:'sc', base_cost:'', active: true }); setModal('new') }
  function openEdit(r) { setForm({...r}); setModal('edit') }

  async function save() {
    if (!form.name?.trim()) return alert('Nome é obrigatório.')
    if (!form.category)     return alert('Selecione a categoria.')
    setSaving(true)
    const payload = {
      name:      form.name.trim(),
      category:  form.category,
      unit:      form.unit || 'sc',
      base_cost: form.base_cost !== '' && form.base_cost != null ? Number(form.base_cost) : null,
      active:    form.active !== false,
    }
    const { error } = modal === 'new'
      ? await supabase.from('products').insert(payload)
      : await supabase.from('products').update(payload).eq('id', form.id)
    if (error) { alert('Erro ao salvar: ' + error.message); setSaving(false); return }
    await load(); setModal(null); setSaving(false)
  }

  async function toggle(id, active) {
    await supabase.from('products').update({ active }).eq('id', id)
    await load()
  }

  const filtered = filterCat ? rows.filter(r => r.category === filterCat) : rows

  return (
    <div className="stack">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="text-muted">{filtered.length} produto{filtered.length !== 1 ? 's' : ''}</span>
          <select className="form-control" style={{ width: 'auto' }}
            value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="">Todas as categorias</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openNew}>+ Novo produto</button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {filtered.length === 0
          ? <div className="empty-state"><p>Nenhum produto cadastrado.</p></div>
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Nome</th><th>Categoria</th><th>Unidade</th><th>Custo base</th><th>TSI</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.id}>
                      <td className="td-strong">{r.name}</td>
                      <td>
                        <span className="tag"
                          style={r.category === 'Semente' ? { background: 'var(--green-100)', color: 'var(--green-700)' } : {}}>
                          {r.category || '—'}
                        </span>
                      </td>
                      <td><span className="tag">{r.unit}</span></td>
                      <td>{r.base_cost ? `R$ ${Number(r.base_cost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                      <td>
                        {r.category === 'Semente'
                          ? <span className="badge badge-enviada">Habilitado</span>
                          : <span style={{ color: 'var(--text-3)', fontSize: '.75rem' }}>—</span>}
                      </td>
                      <td>
                        <span className={`badge ${r.active ? 'badge-fechada' : 'badge-perdida'}`}>
                          {r.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td>
                        <div className="row">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => toggle(r.id, !r.active)}>
                            {r.active ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>

      {modal && (
        <CrudModal title={modal === 'new' ? 'Novo produto' : 'Editar produto'}
          onClose={() => setModal(null)} onSave={save} saving={saving}>
          <div className="form-grid form-grid-2">
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nome *</label>
              <input className="form-control" value={form.name || ''} autoFocus
                onChange={e => setForm(f => ({...f, name: e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Categoria *</label>
              <select className="form-control" value={form.category || ''}
                onChange={e => setForm(f => ({...f, category: e.target.value}))}>
                <option value="">Selecione…</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Unidade *</label>
              <select className="form-control" value={form.unit || 'sc'}
                onChange={e => setForm(f => ({...f, unit: e.target.value}))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Custo base (R$) — opcional</label>
              <input className="form-control" type="number" min="0" step="0.01"
                placeholder="Pode ser sobrescrito na cotação"
                value={form.base_cost || ''}
                onChange={e => setForm(f => ({...f, base_cost: e.target.value}))} />
            </div>
            {form.category === 'Semente' && (
              <div style={{ gridColumn: '1/-1', background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 'var(--radius-sm)', padding: '10px 14px' }}>
                <span style={{ fontSize: '.8125rem', color: 'var(--green-700)' }}>
                  🌱 Produto do tipo <strong>Semente</strong> — ao adicionar em cotações, será possível incluir tratamentos TSI.
                </span>
              </div>
            )}
          </div>
        </CrudModal>
      )}
    </div>
  )
}

/* ── TSI Catalog ──────────────────────────────────────────── */
const TSI_TYPES = ['Fungicida', 'Inseticida', 'Inoculante', 'Micronutriente', 'Outros']

function TsiCatalogTab() {
  const [rows, setRows]     = useState([])
  const [modal, setModal]   = useState(null)
  const [form, setForm]     = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])
  const load = async () => {
    const { data } = await supabase.from('tsi_catalog').select('*').order('category').order('name')
    setRows(data || [])
  }

  function openNew()   { setForm({ name:'', category:'Fungicida', unit:'L', base_cost:'', active: true }); setModal('new') }
  function openEdit(r) { setForm({...r}); setModal('edit') }

  async function save() {
    if (!form.name?.trim()) return alert('Nome é obrigatório.')
    setSaving(true)
    const payload = {
      name:      form.name.trim(),
      category:  form.category || 'Outros',
      unit:      form.unit || 'L',
      base_cost: form.base_cost !== '' && form.base_cost != null ? Number(form.base_cost) : null,
      active:    form.active !== false,
    }
    const { error } = modal === 'new'
      ? await supabase.from('tsi_catalog').insert(payload)
      : await supabase.from('tsi_catalog').update(payload).eq('id', form.id)
    if (error) { alert('Erro: ' + error.message); setSaving(false); return }
    await load(); setModal(null); setSaving(false)
  }

  const grouped = TSI_TYPES.map(cat => ({
    cat, items: rows.filter(r => r.category === cat)
  })).filter(g => g.items.length > 0)

  return (
    <div className="stack">
      <div className="row-between">
        <p className="text-muted" style={{ fontSize: '.875rem' }}>
          Tratamentos disponíveis para seleção ao cotar sementes.
        </p>
        <button className="btn btn-primary btn-sm" onClick={openNew}>+ Novo tratamento</button>
      </div>

      {rows.length === 0 && (
        <div className="empty-state"><p>Nenhum tratamento cadastrado.</p></div>
      )}

      {grouped.map(({ cat, items }) => (
        <div key={cat} className="card" style={{ overflow: 'hidden' }}>
          <div className="card-header" style={{ paddingBottom: 8 }}>
            <span className="card-title">{cat}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nome</th><th>Unidade</th><th>Custo base</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {items.map(r => (
                  <tr key={r.id}>
                    <td className="td-strong">{r.name}</td>
                    <td><span className="tag">{r.unit}</span></td>
                    <td>{r.base_cost ? `R$ ${Number(r.base_cost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                    <td>
                      <span className={`badge ${r.active ? 'badge-fechada' : 'badge-perdida'}`}>
                        {r.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {modal && (
        <CrudModal title={modal === 'new' ? 'Novo tratamento TSI' : 'Editar tratamento'}
          onClose={() => setModal(null)} onSave={save} saving={saving}>
          <div className="form-grid form-grid-2">
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Nome *</label>
              <input className="form-control" value={form.name || ''} autoFocus
                placeholder="Ex: Carboxina + Thiram"
                onChange={e => setForm(f => ({...f, name: e.target.value}))} />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-control" value={form.category || 'Fungicida'}
                onChange={e => setForm(f => ({...f, category: e.target.value}))}>
                {TSI_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Unidade</label>
              <select className="form-control" value={form.unit || 'L'}
                onChange={e => setForm(f => ({...f, unit: e.target.value}))}>
                {['L', 'mL', 'kg', 'g', 'doses', 'un'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">Custo base (R$) — opcional</label>
              <input className="form-control" type="number" min="0" step="0.01"
                placeholder="Pode ser sobrescrito na cotação"
                value={form.base_cost || ''}
                onChange={e => setForm(f => ({...f, base_cost: e.target.value}))} />
            </div>
          </div>
        </CrudModal>
      )}
    </div>
  )
}

/* ── Sellers ──────────────────────────────────────────────── */
function SellersTab() {
  const [rows, setRows]     = useState([])
  const [modal, setModal]   = useState(null)
  const [form, setForm]     = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])
  const load = async () => {
    const { data } = await supabase.from('sellers').select('*').order('name')
    setRows(data || [])
  }

  function openEdit(r) { setForm({...r}); setModal('edit') }

  async function save() {
    setSaving(true)
    await supabase.from('sellers').update({ name: form.name, role: form.role, active: form.active }).eq('id', form.id)
    await load(); setModal(null); setSaving(false)
  }

  async function toggle(id, active) {
    await supabase.from('sellers').update({ active }).eq('id', id)
    await load()
  }

  return (
    <div className="stack">
      <div className="alert" style={{ background: 'var(--blue-100)', color: 'var(--blue-600)' }}>
        💡 Para adicionar um novo vendedor: Supabase → Authentication → Users → <strong>Invite user</strong>. Ele aparecerá aqui após o primeiro login.
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {rows.length === 0
          ? <div className="empty-state"><p>Nenhum vendedor ainda.</p></div>
          : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td className="td-strong">{r.name}</td>
                      <td>{r.email}</td>
                      <td><span className="tag">{r.role === 'admin' ? 'Admin' : 'Vendedor'}</span></td>
                      <td><span className={`badge ${r.active ? 'badge-fechada' : 'badge-perdida'}`}>{r.active ? 'Ativo' : 'Inativo'}</span></td>
                      <td>
                        <div className="row">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Editar</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => toggle(r.id, !r.active)}>
                            {r.active ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </div>
      {modal === 'edit' && (
        <CrudModal title="Editar vendedor" onClose={() => setModal(null)} onSave={save} saving={saving}>
          <div className="stack">
            <Field label="Nome" k="name" form={form} setForm={setForm} />
            <div className="form-group">
              <label className="form-label">Papel</label>
              <select className="form-control" value={form.role || 'seller'}
                onChange={e => setForm(f => ({...f, role: e.target.value}))}>
                <option value="seller">Vendedor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
        </CrudModal>
      )}
    </div>
  )
}

/* ── Shared ───────────────────────────────────────────────── */
function CrudModal({ title, onClose, onSave, saving, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn btn-secondary btn-sm btn-icon" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, k, form, setForm, type = 'text', placeholder }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-control" type={type} value={form[k] || ''} placeholder={placeholder}
        onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
    </div>
  )
}
