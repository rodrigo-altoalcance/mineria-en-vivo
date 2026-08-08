import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /auth/callback?code=...&next=/mapa
// Recibe el `code` de PKCE que Supabase agrega al link de confirmación de
// email, invitación o recuperación de contraseña, y lo intercambia por una
// sesión (cookies httpOnly) antes de redirigir a `next`.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/mapa'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }
  }

  return NextResponse.redirect(
    new URL('/login?error=No pudimos verificar el enlace, intenta de nuevo', origin)
  )
}
