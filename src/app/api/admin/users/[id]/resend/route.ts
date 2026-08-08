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

// POST /api/admin/users/[id]/resend — resend invite / password reset email
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await assertAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const admin = createAdminClient()

  // Get user email from profiles
  const { data: profile } = await admin.from('profiles').select('email').eq('id', id).single()
  if (!profile?.email) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const { error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: profile.email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://mineria-en-vivo.vercel.app'}/mapa`,
    },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
