import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MapClient from './MapClient'
import type { FavoritoRow } from '@/types/database'

export default async function MapaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: favoritos }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('favoritos').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
  ])

  return (
    <MapClient
      profile={profile}
      initialFavoritos={(favoritos ?? []) as FavoritoRow[]}
    />
  )
}
