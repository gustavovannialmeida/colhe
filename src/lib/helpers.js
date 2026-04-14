export const STATUS_LABELS = {
  rascunho:       'Rascunho',
  enviada:        'Enviada',
  em_negociacao:  'Em Negociação',
  fechada:        'Fechada',
  perdida:        'Perdida',
}

export const STATUS_ORDER = ['rascunho','enviada','em_negociacao','fechada','perdida']

export function fmtBRL(value) {
  if (value == null || isNaN(value)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function fmtPct(value) {
  if (value == null || isNaN(value)) return '—'
  return Number(value).toFixed(1) + '%'
}

export function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}

export function fmtDateShort(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function fmtDatetime(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export function initials(name = '') {
  return name.split(' ').slice(0,2).map(w => w[0]?.toUpperCase() || '').join('')
}

export function calcMargin(unitPrice, discountPct, unitCost) {
  const fp = unitPrice * (1 - (discountPct || 0) / 100)
  if (!fp) return 0
  return ((fp - unitCost) / fp) * 100
}

export function calcNetMargin(items, freight, commissionPct) {
  const revenue = items.reduce((s, i) => s + i.quantity * i.unit_price * (1 - (i.discount_pct||0)/100), 0)
  const cost    = items.reduce((s, i) => s + i.quantity * i.unit_cost, 0)
  if (!revenue) return 0
  const net = revenue - cost - (freight || 0) - revenue * (commissionPct || 0) / 100
  return (net / revenue) * 100
}
