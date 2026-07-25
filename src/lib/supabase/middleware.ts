import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Rutas protegidas — redirigir a login si no hay sesión
  const protectedRoutes = ['/mapa', '/boletin', '/cuenta', '/admin']
  const isProtected = protectedRoutes.some(r => pathname.startsWith(r))

  if (isProtected && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Admin — solo rol admin puede acceder
  if (pathname.startsWith('/admin')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user!.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.redirect(new URL('/mapa', request.url))
    }
  }

  // Si ya tiene sesión, redirigir lejos de login/register
  if ((pathname === '/login' || pathname === '/register') && user) {
    return NextResponse.redirect(new URL('/mapa', request.url))
  }

  return supabaseResponse
}
