'use client'

import { useState, useTransition } from 'react'
import type { ProfileRow } from '@/types/database'
import InviteModal from './InviteModal'

type Plan = 'free' | 'pro' | 'enterprise'
type Role = 'user' | 'admin'

const PLAN_LABEL: Record<Plan, string> = { free: 'Básico', pro: 'Profesional', enterprise: 'Empresa' }
const PLAN_COLOR: Record<Plan, string> = {
  free: 'rgba(34,197,94,0.12)',
  pro: 'rgba(100,138,255,0.12)',
  enterprise: 'rgba(217,119,6,0.12)',
}
const PLAN_TEXT: Record<Plan, string> = { free: 'var(--ok)', pro: 'var(--accent)', enterprise: 'var(--warn)' }

export default function UsersTable({ initialUsers }: { initialUsers: ProfileRow[] }) {
  const [users, setUsers] = useState(initialUsers)
  const [q, setQ] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState<ProfileRow | null>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const filtered = q
    ? users.filter(u =>
        u.email?.toLowerCase().includes(q.toLowerCase()) ||
        u.full_name?.toLowerCase().includes(q.toLowerCase())
      )
    : users

  async function updateUser(id: string, patch: Partial<ProfileRow>) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const { error } = await res.json()
      showToast(error ?? 'Error al actualizar', false)
      return false
    }
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u))
    showToast('Usuario actualizado')
    return true
  }

  async function deleteUser(user: ProfileRow) {
    const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const { error } = await res.json()
      showToast(error ?? 'Error al eliminar', false)
      return
    }
    setUsers(prev => prev.filter(u => u.id !== user.id))
    setConfirmDelete(null)
    showToast(`${user.email} eliminado`)
  }

  async function resendEmail(user: ProfileRow) {
    const res = await fetch(`/api/admin/users/${user.id}/resend`, { method: 'POST' })
    if (!res.ok) {
      const { error } = await res.json()
      showToast(error ?? 'Error al reenviar', false)
      return
    }
    showToast(`Email enviado a ${user.email}`)
  }

  function onInvited(newUser: ProfileRow) {
    setUsers(prev => [newUser, ...prev])
    setShowInvite(false)
    showToast(`Invitación enviada a ${newUser.email}`)
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl"
          style={{
            background: toast.ok ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${toast.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
            color: toast.ok ? 'var(--ok)' : 'var(--error)',
          }}>
          {toast.msg}
        </div>
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-xl p-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>
              ¿Eliminar usuario?
            </h3>
            <p className="text-xs mb-5" style={{ color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text)' }}>{confirmDelete.email}</strong> será eliminado permanentemente.
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded text-xs font-medium"
                style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                Cancelar
              </button>
              <button onClick={() => deleteUser(confirmDelete)}
                className="px-4 py-2 rounded text-xs font-bold"
                style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.3)' }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <InviteModal onClose={() => setShowInvite(false)} onInvited={onInvited} />
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar por nombre o email…"
          className="flex-1 px-3 py-2 rounded text-sm outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <button
          onClick={() => setShowInvite(true)}
          className="px-4 py-2 rounded text-xs font-bold flex-shrink-0"
          style={{ background: 'var(--accent)', color: '#00164d' }}>
          + Invitar usuario
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                {['Nombre / Email', 'Plan', 'Rol', 'Registrado', 'Acciones'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center"
                    style={{ color: 'var(--text-faint)' }}>
                    {q ? 'Sin resultados para esa búsqueda' : 'No hay usuarios'}
                  </td>
                </tr>
              )}
              {filtered.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid var(--border-dim)', background: 'var(--surface)' }}
                  className="hover:bg-[var(--surface2)] transition-colors">

                  {/* Nombre / Email */}
                  <td className="px-4 py-3">
                    <div className="font-medium" style={{ color: 'var(--text)' }}>
                      {u.full_name || <span style={{ color: 'var(--text-faint)' }}>—</span>}
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>{u.email}</div>
                  </td>

                  {/* Plan */}
                  <td className="px-4 py-3">
                    <select
                      value={u.plan}
                      onChange={e => startTransition(() => { updateUser(u.id, { plan: e.target.value as Plan }) })}
                      disabled={isPending}
                      className="px-2 py-0.5 rounded-full text-xs font-bold uppercase cursor-pointer outline-none"
                      style={{
                        background: PLAN_COLOR[u.plan as Plan] ?? 'transparent',
                        color: PLAN_TEXT[u.plan as Plan] ?? 'var(--text)',
                        border: 'none',
                      }}>
                      <option value="free">Básico</option>
                      <option value="pro">Profesional</option>
                      <option value="enterprise">Empresa</option>
                    </select>
                  </td>

                  {/* Rol */}
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={e => startTransition(() => { updateUser(u.id, { role: e.target.value as Role }) })}
                      disabled={isPending}
                      className="px-2 py-0.5 rounded text-xs font-medium cursor-pointer outline-none"
                      style={{
                        background: 'transparent',
                        color: u.role === 'admin' ? 'var(--warn)' : 'var(--text-muted)',
                        border: '1px solid var(--border-dim)',
                      }}>
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>

                  {/* Fecha */}
                  <td className="px-4 py-3" style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                    {new Date(u.created_at).toLocaleDateString('es-CL')}
                  </td>

                  {/* Acciones */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => resendEmail(u)}
                        title="Reenviar email de acceso"
                        className="px-2 py-1 rounded text-xs"
                        style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border-dim)' }}>
                        ✉ Reenviar
                      </button>
                      <button
                        onClick={() => setConfirmDelete(u)}
                        title="Eliminar usuario"
                        className="px-2 py-1 rounded text-xs"
                        style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--error)', border: '1px solid rgba(239,68,68,0.2)' }}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="px-4 py-2" style={{ background: 'var(--surface2)', borderTop: '1px solid var(--border-dim)' }}>
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
              {filtered.length} {filtered.length === 1 ? 'usuario' : 'usuarios'}
              {q && ` · filtrando por "${q}"`}
            </span>
          </div>
        )}
      </div>
    </>
  )
}
