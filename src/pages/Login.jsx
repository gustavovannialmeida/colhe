import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const navigate   = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await signIn(email, password)
    if (err) {
      setError('E-mail ou senha inválidos.')
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.left}>
        <div style={styles.brand}>
          <h1 style={styles.logo}>Colhe</h1>
          <p style={styles.tagline}>
            Gerencie suas cotações<br />do campo ao fechamento.
          </p>
        </div>
        <p style={styles.foot}>© {new Date().getFullYear()} Colhe. Plataforma agro.</p>
      </div>

      <div style={styles.right}>
        <div style={styles.card}>
          <div style={{ marginBottom: 28 }}>
            <h2 style={styles.title}>Entrar</h2>
            <p style={styles.sub}>Acesse com suas credenciais</p>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit} className="stack">
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input
                className="form-control"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Senha</label>
              <input
                className="form-control"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ marginTop: 8, justifyContent: 'center', padding: '11px 16px' }}
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

const styles = {
  page: {
    display: 'flex',
    minHeight: '100dvh',
  },
  left: {
    flex: 1,
    background: 'var(--green-800)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    padding: '48px 48px 36px',
  },
  brand: {},
  logo: {
    fontFamily: 'var(--font-display)',
    color: 'white',
    fontSize: '3rem',
    letterSpacing: '-.03em',
    fontWeight: 600,
  },
  tagline: {
    color: 'rgba(255,255,255,.6)',
    fontSize: '1.125rem',
    lineHeight: 1.6,
    marginTop: 16,
  },
  foot: {
    color: 'rgba(255,255,255,.3)',
    fontSize: '.75rem',
  },
  right: {
    width: '440px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px',
    background: 'var(--bg)',
  },
  card: {
    width: '100%',
    maxWidth: '360px',
  },
  title: {
    fontSize: '1.5rem',
    letterSpacing: '-.02em',
    color: 'var(--text-1)',
  },
  sub: {
    color: 'var(--text-3)',
    fontSize: '.875rem',
    marginTop: 4,
  },
}

// Make it responsive
const css = `
@media (max-width: 640px) {
  .login-left { display: none !important; }
  .login-right { width: 100% !important; }
}
`
if (typeof document !== 'undefined') {
  const s = document.createElement('style')
  s.textContent = css
  document.head.appendChild(s)
}
