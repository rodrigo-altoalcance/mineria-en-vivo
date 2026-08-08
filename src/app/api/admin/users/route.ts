import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // Usar admin client para bypass de RLS — la política "Admins ven todos" es
  // recursiva (se consulta a sí misma) y falla silenciosamente en Edge Runtime.
  // Mismo patrón que middleware.ts y admin/layout.tsx.
  const adminClient = createAdminClient()
  const { data: profile } = await adminClient.from('profiles').select('role').eq('id', user.id).single()
  return profile?.role === 'admin' ? user : null
}

// GET /api/admin/users?q=&page=0&limit=50
export async function GET(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '0')
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50'), 100)

  let query = admin.from('profiles').select('*', { count: 'exact' }).order('created_at', { ascending: false })

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
  }

  const { data: users, error, count } = await query.range(page * limit, page * limit + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users, count, page, limit })
}

// POST /api/admin/users — invite user by email
export async function POST(req: NextRequest) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, full_name, plan = 'free' } = await req.json()
  if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 })

  const admin = createAdminClient()

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: full_name ?? '' },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://mineria-en-vivo.vercel.app'}/mapa`,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Update plan in profiles (trigger may have already created it)
  if (data.user) {
    await admin.from('profiles').upsert({
      id: data.user.id,
      email,
      full_name: full_name ?? null,
      plan,
      role: 'user',
    })
  }

  return NextResponse.json({ ok: true, user: data.user })
}
