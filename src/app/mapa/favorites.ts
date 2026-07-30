'use server'

import { createClient } from '@/lib/supabase/server'
import type { FavoritoRow } from '@/types/database'

export async function addFavorito(payload: {
  numero_rol: string
  dv_rol?: string | null
  nombre?: string | null
  tipo_concesion?: string | null
  situacion_concesion?: string | null
  titular_nombre?: string | null
  comuna?: string | null
}): Promise<{ data: FavoritoRow | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'No autenticado' }

  const { data, error } = await supabase
    .from('favoritos')
    .insert({ user_id: user.id, ...payload })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as FavoritoRow, error: null }
}

export async function removeFavorito(
  numero_rol: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autenticado' }

  const { error } = await supabase
    .from('favoritos')
    .delete()
    .eq('user_id', user.id)
    .eq('numero_rol', numero_rol)

  return { error: error?.message ?? null }
}
