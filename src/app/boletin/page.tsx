import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import BoletinClient from './BoletinClient'
import type { BoletinPublicacion, ProfileRow } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function BoletinPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  if (!profile) {
    const admin = createAdminClient()
    const { data: created } = await admin
      .from('profiles')
      .upsert({ id: user.id, email: user.email! }, { onConflict: 'id' })
      .select().single()
    profile = created
  }

  const { data: publicaciones } = await supabase
    .from('boletin_publicaciones')
    .select('*')
    .order('fecha', { ascending: false })
    .order('nombre', { ascending: true })
    .limit(2000)

  const pubs = (publicaciones ?? []) as BoletinPublicacion[]
  const fechas = [...new Set(pubs.map(p => p.fecha))].sort((a, b) => b.localeCompare(a))

  return (
    <AppShell profile={profile as ProfileRow | null}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {pubs.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center', maxWidth: 400, padding: '0 24px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <h1 style={{ color: 'var(--text)', fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
                Boletín Oficial de Minería
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
                No hay publicaciones aún. El sistema sincroniza automáticamente cada día hábil.
              </p>
            </div>
          </div>
        ) : (
          <BoletinClient publicaciones={pubs} fechas={fechas} />
        )}
      </div>
    </AppShell>
  )
}
