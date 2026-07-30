import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import MapClient from './MapClient'
import type { FavoritoRow, ProfileRow } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function MapaPage({
  searchParams,
}: {
  searchParams: Promise<{ nombre?: string }>
}) {
  const { nombre: buscarNombre } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Buscar perfil; si no existe (trigger no corrió al registrarse), crearlo con admin client
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    const admin = createAdminClient()
    const { data: created } = await admin
      .from('profiles')
      .upsert(
        { id: user.id, email: user.email! },
        { onConflict: 'id' }
      )
      .select()
      .single()
    profile = created
  }

  const { data: favoritos } = await supabase
    .from('favoritos')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <MapClient
      profile={profile as ProfileRow | null}
      initialFavoritos={(favoritos ?? []) as FavoritoRow[]}
      buscarNombre={buscarNombre}
    />
  )
}
