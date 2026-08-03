'use client'

import { useState } from 'react'
import type { ProfileRow } from '@/types/database'

interface Props {
  onClose: () => void
  onInvited: (user: ProfileRow) => void
}

export default function InviteModal({ onClose, onInvited }: Props) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [plan, setPlan] = useState<'free' | 'pro' | 'enterprise'>('free')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, full_name: fullName, plan }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Error al invitar')
      return
    }

    // Build a synthetic ProfileRow to update table immediately
    const newUser: ProfileRow = {
      id: data.user?.id ?? crypto.randomUUID(),
      email,
      full_name: fullName || null,
      role: 'user',
      plan,
      plan_expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    onInvited(newUser)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-dim)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Invitar usuario</h2>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-xs px-3 py-2 rounded"
              style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}>Correo electrónico *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="usuario@email.com"
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}>Nombre completo</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Juan Pérez"
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}>Plan inicial</label>
            <select
              value={plan}
              onChange={e => setPlan(e.target.value as typeof plan)}
              className="w-full px-3 py-2 rounded text-sm outline-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <option value="free">Básico (Gratis)</option>
              <option value="pro">Profesional</option>
              <option value="enterprise">Empresa</option>
            </select>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded text-xs font-medium"
              style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 rounded text-xs font-bold"
              style={{ background: 'var(--accent)', color: '#00164d', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Enviando…' : 'Enviar invitación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
