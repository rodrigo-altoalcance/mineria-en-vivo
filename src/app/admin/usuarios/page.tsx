import { createAdminClient } from '@/lib/supabase/admin'
import UsersTable from '@/components/admin/UsersTable'

export const dynamic = 'force-dynamic'

export default async function AdminUsuariosPage() {
  const admin = createAdminClient()

  const [{ data: users, count }, { data: stats }] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact' }).order('created_at', { ascending: false }).limit(50),
    admin.from('profiles').select('plan'),
  ])

  const planCount = {
    free:       stats?.filter(u => u.plan === 'free').length ?? 0,
    pro:        stats?.filter(u => u.plan === 'pro').length ?? 0,
    enterprise: stats?.filter(u => u.plan === 'enterprise').length ?? 0,
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total usuarios', value: count ?? 0, color: 'var(--text)' },
          { label: 'Plan Básico',    value: planCount.free,       color: 'var(--ok)' },
          { label: 'Profesional',    value: planCount.pro,        color: 'var(--accent)' },
          { label: 'Empresa',        value: planCount.enterprise, color: 'var(--warn)' },
        ].map(m => (
          <div key={m.label} className="rounded-xl p-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-xl font-extrabold mb-0.5"
              style={{ color: m.color, fontVariantNumeric: 'tabular-nums' }}>
              {m.value}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.label}</div>
          </div>
        ))}
      </div>

      <UsersTable initialUsers={users ?? []} />
    </div>
  )
}
