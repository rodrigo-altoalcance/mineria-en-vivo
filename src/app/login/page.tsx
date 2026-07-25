'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Correo o contraseña incorrectos')
      setLoading(false)
      return
    }

    router.push('/mapa')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-black mx-auto mb-4"
            style={{ background: 'var(--accent)', color: '#00164d' }}>M</div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Inicia sesión</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Minería en Vivo</p>
        </div>

        <form onSubmit={handleSubmit}
          className="rounded-xl p-6 space-y-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

          {error && (
            <div className="text-sm px-3 py-2 rounded"
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}>Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="tu@email.com"
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{
                background: 'var(--surface2)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded font-bold text-sm mt-2"
            style={{ background: 'var(--accent)', color: '#00164d', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <p className="text-center text-sm mt-5" style={{ color: 'var(--text-muted)' }}>
          ¿No tienes cuenta?{' '}
          <Link href="/register" style={{ color: 'var(--accent)' }} className="font-semibold">
            Regístrate gratis
          </Link>
        </p>
      </div>
    </div>
  )
}
