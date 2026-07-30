import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MapClient from './MapClient'
import type { FavoritoRow, ProfileRow } from '@/types/database'

export const dynamic = 'force-dynamic'

export default async function MapaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch profile — auto-create if trigger didn't fire on signup
  let { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    const { data: created } = await supabase
      .from('profiles')
      .upsert({ id: user.id, email: user.email! }, { onConflict: 'id' })
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
    />
  )
}
