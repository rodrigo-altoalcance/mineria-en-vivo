import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AppShell from '@/components/layout/AppShell'
import BoletinClient from './BoletinClient'
import type { BoletinPublicacion } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function BoletinPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  const hasBoletin = profile?.plan === 'pro' || profile?.plan === 'enterprise' || profile?.role === 'admin'

  if (!hasBoletin) {
    return (
      <AppShell profile={profile}>
        <div className='h-full flex items-center justify-center px-6 py-12'>
          <div
            className='text-center max-w-sm rounded-xl p-8'
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className='text-3xl mb-4'>🔒</div>
            <h2 className='text-lg font-bold mb-2' style={{ color: 'var(--text)' }}>
              Requiere plan Profesional
            </h2>
            <p className='text-sm mb-6' style={{ color: 'var(--text-muted)' }}>
              El acceso al Boletín Oficial de Minería está disponible desde el plan Profesional.
            </p>
            <Link
              href='/planes'
              className='block text-center py-2.5 rounded font-bold text-sm'
              style={{ background: 'var(--accent)', color: '#00164d' }}
            >
              Ver planes
            </Link>
          </div>
        </div>
      </AppShell>
    )
  }

  // Fetch last 60 days of publications
  const { data: publicaciones } = await supabase
    .from('boletin_publicaciones')
    .select('*')
    .order('fecha', { ascending: false })
    .order('nombre', { ascending: true })
    .limit(2000)

  const pubs = (publicaciones ?? []) as BoletinPublicacion[]

  // Unique sorted dates (most recent first)
  const fechas = [...new Set(pubs.map(p => p.fecha))].sort((a, b) => b.localeCompare(a))

  const isEmpty = pubs.length === 0

  return (
    <AppShell profile={profile}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {isEmpty ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center', maxWidth: 400, padding: '0 24px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <h1 style={{ color: 'var(--text)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
                Boletín Oficial de Minería
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                No hay publicaciones aún. El sistema sincroniza automáticamente cada día hábil.
                También puedes ejecutar la primera sincronización manualmente.
              </p>
              <div style={{
                background: 'rgba(100,138,255,0.08)', border: '1px solid rgba(100,138,255,0.2)',
                borderRadius: 8, padding: '12px 16px', fontSize: 12,
                color: 'var(--text-muted)', textAlign: 'left',
              }}>
                <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 6 }}>
                  Cómo sincronizar:
                </strong>
                Llama a <code style={{ color: 'var(--accent)' }}>/api/boletin/sync?secret=TU_SECRET</code> desde el navegador o Postman.
              </div>
            </div>
          </div>
        ) : (
          <BoletinClient publicaciones={pubs} fechas={fechas} />
        )}
      </div>
    </AppShell>
  )
}
