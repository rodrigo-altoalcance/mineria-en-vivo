import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import Link from 'next/link'

export default async function CuentaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  const planLabel: Record<string, string> = { free: 'Básico (Gratis)', pro: 'Profesional', enterprise: 'Empresa' }

  return (
    <AppShell profile={profile}>
      <div className="max-w-xl mx-auto px-6 py-10">
        <h1 className="text-lg font-bold mb-6" style={{ color: 'var(--text)' }}>Mi cuenta</h1>

        <div className="rounded-xl p-6 space-y-4"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

          <div className="flex justify-between items-center py-3"
            style={{ borderBottom: '1px solid var(--border-dim)' }}>
            <span className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}>Nombre</span>
            <span className="text-sm" style={{ color: 'var(--text)' }}>{profile?.full_name || '—'}</span>
          </div>

          <div className="flex justify-between items-center py-3"
            style={{ borderBottom: '1px solid var(--border-dim)' }}>
            <span className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}>Correo</span>
            <span className="text-sm" style={{ color: 'var(--text)' }}>{profile?.email}</span>
          </div>

          <div className="flex justify-between items-center py-3"
            style={{ borderBottom: '1px solid var(--border-dim)' }}>
            <span className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}>Plan actual</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                background: profile?.plan === 'pro' ? 'var(--accent-dim)' : 'rgba(34,197,94,0.1)',
                color: profile?.plan === 'pro' ? 'var(--accent)' : 'var(--ok)',
              }}>
              {planLabel[profile?.plan || 'free']}
            </span>
          </div>

          {profile?.role === 'admin' && (
            <div className="flex justify-between items-center py-3"
              style={{ borderBottom: '1px solid var(--border-dim)' }}>
              <span className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-muted)' }}>Rol</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded"
                style={{ background: 'rgba(217,119,6,0.12)', color: 'var(--warn)' }}>
                Administrador
              </span>
            </div>
          )}

          <div className="flex justify-between items-center py-3">
            <span className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}>Miembro desde</span>
            <span className="text-sm" style={{ color: 'var(--text)' }}>
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('es-CL') : '—'}
            </span>
          </div>
        </div>

        {profile?.plan === 'free' && profile?.role !== 'admin' && (
          <div className="mt-6 rounded-xl p-5 flex items-center justify-between gap-4"
            style={{ background: 'var(--accent-dim)', border: '1px solid rgba(100,138,255,0.25)' }}>
            <div>
              <div className="text-sm font-bold mb-0.5" style={{ color: 'var(--text)' }}>
                Actualiza al plan Profesional
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Accede al Boletín Oficial y más funciones
              </div>
            </div>
            <Link href="/planes"
              className="flex-shrink-0 px-4 py-2 rounded font-bold text-xs"
              style={{ background: 'var(--accent)', color: '#00164d' }}>
              Ver planes
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  )
}
