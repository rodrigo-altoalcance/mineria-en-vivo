'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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

export default function NuevaPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) { setError(error.message); setLoading(false); return }

    setSuccess(true)
    setLoading(false)
    setTimeout(() => { router.push('/mapa'); router.refresh() }, 1500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm">

        <div className="text-center mb-7">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-base font-black mx-auto mb-4"
            style={{ background: 'var(--accent)', color: '#00164d' }}>M</div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Define tu nueva contraseña</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Minería en Vivo
          </p>
        </div>

        {success ? (
          <div className="rounded-xl p-6 text-center space-y-2"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto mb-2"
              style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
              ✅
            </div>
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Contraseña actualizada</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Redirigiendo…</p>
          </div>
        ) : (
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
                style={{ color: 'var(--text-muted)' }}>Nueva contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              <PasswordStrength password={password} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}>Confirma la contraseña</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="Repite la contraseña"
                autoComplete="new-password"
                className="w-full px-3 py-2 rounded text-sm outline-none"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded font-bold text-sm mt-1"
              style={{ background: 'var(--accent)', color: '#00164d', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
