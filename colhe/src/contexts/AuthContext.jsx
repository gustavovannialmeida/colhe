import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null)
  const [seller, setSeller] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchSeller(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchSeller(session.user.id)
      else { setSeller(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchSeller(userId) {
    try {
      const { data } = await supabase.from('sellers').select('*').eq('id', userId).single()
      if (data) {
        setSeller(data)
      } else {
        const { data: { user: u } } = await supabase.auth.getUser()
        const email = u?.email || ''
        const name  = email.split('@')[0].replace(/[._-]/g, ' ')
        await supabase.from('sellers').insert({ id: userId, name, email })
        const { data: s } = await supabase.from('sellers').select('*').eq('id', userId).single()
        setSeller(s)
      }
    } catch (e) {
      console.error('fetchSeller error', e)
    } finally {
      setLoading(false)
    }
  }

  const signIn  = (email, password) => supabase.auth.signInWithPassword({ email, password })
  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, seller, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
