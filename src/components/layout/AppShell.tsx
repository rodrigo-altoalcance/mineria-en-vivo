'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { Profile } from '@/types/database'
import { createClient } from '@/lib/supabase/client'

const NAV = [
  { href: '/mapa',    label: 'Mapa',    icon: '🗺' },
  { href: '/boletin', label: 'Boletín', icon: '📋' },
  { href: '/cuenta',  label: 'Cuenta',  icon: '👤' },
]

export default function AppShell({ profile, children }: { profile: Profile | null; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg)' }}>
      {/* Top nav */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 h-12 z-10"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>

        <div className="flex items-center gap-4">
          <Link href="/mapa" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center text-xs font-black"
              style={{ background: 'var(--accent)', color: '#00164d' }}>M</div>
            <span className="font-bold text-xs tracking-wide hidden sm:block"
              style={{ color: 'var(--text)' }}>Minería en Vivo</span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map(item => {
              const active = pathname.startsWith(item.href)
              return (
                <Link key={item.href} href={item.href}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
                  style={{
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                    background: active ? 'var(--accent-dim)' : 'transparent',
                  }}>
                  <span>{item.icon}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              )
            })}
            {profile?.role === 'admin' && (
              <Link href="/admin"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
                style={{
                  color: pathname.startsWith('/admin') ? 'var(--accent)' : 'var(--text-muted)',
                  background: pathname.startsWith('/admin') ? 'var(--accent-dim)' : 'transparent',
                }}>
                <span>⚙️</span>
                <span className="hidden sm:inline">Admin</span>
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs hidden sm:block" style={{ color: 'var(--text-faint)' }}>
            {profile?.full_name || profile?.email}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wide"
            style={{
              background: profile?.plan === 'pro' ? 'var(--accent-dim)' : 'rgba(34,197,94,0.1)',
              color: profile?.plan === 'pro' ? 'var(--accent)' : 'var(--ok)',
            }}>
            {profile?.plan || 'free'}
          </span>
          <button onClick={signOut} className="text-xs px-2 py-1 rounded"
            style={{ color: 'var(--text-faint)', border: '1px solid var(--border-dim)' }}>
            Salir
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-hidden relative">
        {children}
      </main>
    </div>
  )
}
