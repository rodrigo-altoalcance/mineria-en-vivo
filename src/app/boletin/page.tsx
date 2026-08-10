import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import BoletinClient from './BoletinClient'
import { resolverRango } from '@/lib/dateRange'
import type { BoletinPublicacion, ProfileRow } from '@/types/database'

export const dynamic = 'force-dynamic'

// Tope de seguridad — NO es el mecanismo de filtrado (ese es el .gte/.lte
// por fecha sobre el rango elegido). Es solo un límite defensivo por si una
// ventana de 3 meses concentrara un volumen inusual de publicaciones.
const LIMITE_FILAS = 5000

export default async function BoletinPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const { desde: desdeParam, hasta: hastaParam } = await searchParams

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

  // Fecha más reciente con publicaciones — solo para calcular el rango por
  // defecto cuando no viene desde/hasta en la URL (o son inválidos).
  const { data: ultimaFechaRow } = await supabase
    .from('boletin_publicaciones')
    .select('fecha')
    .order('fecha', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { desde, hasta } = resolverRango(desdeParam, hastaParam, ultimaFechaRow?.fecha ?? null)

  const { data: publicaciones } = await supabase
    .from('boletin_publicaciones')
    .select('*')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha', { ascending: false })
    .order('nombre', { ascending: true })
    .limit(LIMITE_FILAS)

  const pubs = (publicaciones ?? []) as BoletinPublicacion[]
  const hayDatosGlobales = !!ultimaFechaRow

  return (
    <AppShell profile={profile as ProfileRow | null}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!hayDatosGlobales ? (
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
          <BoletinClient publicaciones={pubs} desde={desde} hasta={hasta} />
        )}
      </div>
    </AppShell>
  )
}
