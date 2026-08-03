'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ]
  const score = checks.filter(Boolean).length
  const labels = ['', 'Débil', 'Regular', 'Buena', 'Fuerte']
  const colors = ['', 'var(--error)', 'var(--warn)', 'var(--ok)', 'var(--ok)']

  if (!password) return null

  return (
    <div className="space-y-1.5 mt-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-1 h-1 rounded-full transition-all"
            style={{ background: i <= score ? colors[score] : 'var(--border)' }} />
        ))}
      </div>
      <div className="text-xs" style={{ color: colors[score] }}>{labels[score]}</div>
    </div>
  )
}

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [terms, setTerms] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    if (!terms) { setError('Debes aceptar los términos de uso'); return }

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

    if (error) { setError(error.message); setLoading(false); return }
    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'var(--bg)' }}>
        <div className="w-full max-w-sm text-center rounded-xl p-8"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto mb-4"
            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
            ✉️
          </div>
          <h2 className="text-base font-bold mb-2" style={{ color: 'var(--text)' }}>Revisa tu correo</h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
            Enviamos un enlace de confirmación a
          </p>
          <p className="text-sm font-bold mb-5" style={{ color: 'var(--text)' }}>{email}</p>
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
            Haz clic en el enlace para activar tu cuenta. Revisa también la carpeta de spam.
          </p>
          <div className="mt-6 pt-5" style={{ borderTop: '1px solid var(--border-dim)' }}>
            <Link href="/login" className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
              Ir al inicio de sesión →
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">

        <div className="text-center mb-7">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-base font-black mx-auto mb-4"
            style={{ background: 'var(--accent)', color: '#00164d' }}>M</div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Crea tu cuenta</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Plan gratuito · Sin tarjeta requerida
          </p>
        </div>

        <form onSubmit={handleSubmit}
          className="rounded-xl p-6 space-y-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

          {error && (
            <div className="text-xs px-3 py-2 rounded"
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
              autoComplete="name"
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
              autoComplete="email"
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}>Contraseña</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                className="w-full px-3 py-2 pr-10 rounded text-sm outline-none"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              <button type="button" onClick={() => setShowPass(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                style={{ color: 'var(--text-faint)' }}>
                {showPass ? 'Ocultar' : 'Ver'}
              </button>
            </div>
            <PasswordStrength password={password} />
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={terms}
              onChange={e => setTerms(e.target.checked)}
              className="mt-0.5 flex-shrink-0"
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Acepto los{' '}
              <Link href="/terminos" style={{ color: 'var(--accent)' }}>términos de uso</Link>
              {' '}y la{' '}
              <Link href="/privacidad" style={{ color: 'var(--accent)' }}>política de privacidad</Link>
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !terms}
            className="w-full py-2.5 rounded font-bold text-sm mt-1"
            style={{
              background: 'var(--accent)',
              color: '#00164d',
              opacity: loading || !terms ? 0.6 : 1,
              cursor: !terms ? 'not-allowed' : 'pointer',
            }}>
            {loading ? 'Creando cuenta…' : 'Crear cuenta gratis'}
          </button>
        </form>

        <p className="text-center text-xs mt-5" style={{ color: 'var(--text-muted)' }}>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" style={{ color: 'var(--accent)' }} className="font-semibold">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
