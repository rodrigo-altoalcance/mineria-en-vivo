import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  if (profile?.role !== 'admin') redirect('/mapa')

  const { data: users, count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(50)

  const planCount = {
    free: users?.filter(u => u.plan === 'free').length ?? 0,
    pro: users?.filter(u => u.plan === 'pro').length ?? 0,
    enterprise: users?.filter(u => u.plan === 'enterprise').length ?? 0,
  }

  return (
    <AppShell profile={profile}>
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>Panel de administración</h1>
        <p className="text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
          {count} usuarios registrados
        </p>

        {/* Métricas */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Básico (Gratis)', value: planCount.free, color: 'var(--ok)' },
            { label: 'Profesional', value: planCount.pro, color: 'var(--accent)' },
            { label: 'Empresa', value: planCount.enterprise, color: 'var(--warn)' },
          ].map(m => (
            <div key={m.label} className="rounded-xl p-5"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="text-2xl font-extrabold mb-1" style={{ color: m.color, fontVariantNumeric: 'tabular-nums' }}>
                {m.value}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* Tabla de usuarios */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <div className="px-4 py-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
              Usuarios recientes
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border-dim)' }}>
                  {['Nombre', 'Email', 'Plan', 'Rol', 'Registrado'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-faint)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users?.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border-dim)', background: 'var(--surface)' }}>
                    <td className="px-4 py-3" style={{ color: 'var(--text)' }}>{u.full_name || '—'}</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full font-bold uppercase"
                        style={{
                          background: u.plan === 'pro' ? 'var(--accent-dim)' : 'rgba(34,197,94,0.1)',
                          color: u.plan === 'pro' ? 'var(--accent)' : 'var(--ok)',
                        }}>
                        {u.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3" style={{ color: u.role === 'admin' ? 'var(--warn)' : 'var(--text-faint)' }}>
                      {u.role}
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-faint)' }}>
                      {new Date(u.created_at).toLocaleDateString('es-CL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
