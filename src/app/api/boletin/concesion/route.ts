import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const nombre = req.nextUrl.searchParams.get('nombre')
  if (!nombre) return NextResponse.json([])

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('boletin_publicaciones')
    .select('*')
    .ilike('nombre', nombre)
    .order('fecha', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data ?? [])
}
