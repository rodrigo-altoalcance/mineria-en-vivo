import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import Link from 'next/link'

export default async function BoletinPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  const hasBoletin = profile?.plan === 'pro' || profile?.plan === 'enterprise'

  return (
    <AppShell profile={profile}>
      <div className="h-full flex items-center justify-center px-6 py-12">
        {hasBoletin ? (
          <div className="text-center max-w-md">
            <div className="text-4xl mb-4">📋</div>
            <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>
              Boletín Oficial de Minería
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              El módulo de integración con el Boletín está en desarrollo.
              Aquí podrás buscar pedimentos, mensuras, renuncias y sentencias por nombre, RUT o región.
            </p>
            <div className="mt-4 text-xs px-3 py-2 rounded"
              style={{ background: 'rgba(217,119,6,0.08)', color: 'var(--warn)', border: '1px solid rgba(217,119,6,0.2)' }}>
              Próximamente disponible
            </div>
          </div>
        ) : (
          <div className="text-center max-w-sm rounded-xl p-8"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-3xl mb-4">🔒</div>
            <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>
              Requiere plan Profesional
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              El acceso al Boletín Oficial de Minería está disponible desde el plan Profesional.
            </p>
            <Link href="/planes"
              className="block text-center py-2.5 rounded font-bold text-sm"
              style={{ background: 'var(--accent)', color: '#00164d' }}>
              Ver planes
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  )
}
