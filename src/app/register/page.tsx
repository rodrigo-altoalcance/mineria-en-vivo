'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/mapa`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'var(--bg)' }}>
        <div className="w-full max-w-sm text-center rounded-xl p-8"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-3xl mb-4">✉️</div>
          <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>Revisa tu correo</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Enviamos un enlace de confirmación a <strong style={{ color: 'var(--text)' }}>{email}</strong>.
            Haz clic en el enlace para activar tu cuenta.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-black mx-auto mb-4"
            style={{ background: 'var(--accent)', color: '#00164d' }}>M</div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Crea tu cuenta</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Plan gratuito · Sin tarjeta requerida</p>
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
              style={{ color: 'var(--text-muted)' }}>Nombre completo</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
              placeholder="Juan Pérez"
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

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
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
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
              placeholder="Mínimo 8 caracteres"
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded font-bold text-sm mt-2"
            style={{ background: 'var(--accent)', color: '#00164d', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Creando cuenta…' : 'Crear cuenta gratis'}
          </button>
        </form>

        <p className="text-center text-sm mt-5" style={{ color: 'var(--text-muted)' }}>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" style={{ color: 'var(--accent)' }} className="font-semibold">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
