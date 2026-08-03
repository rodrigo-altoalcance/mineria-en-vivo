'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/admin/usuarios', label: 'Usuarios', icon: '👥' },
  { href: '/admin/batch',    label: 'Batch OCR', icon: '⚙️' },
]

export default function AdminNav() {
  const pathname = usePathname()

  return (
    <div className="flex-shrink-0 flex items-center gap-1 px-6 pt-5 pb-0"
      style={{ borderBottom: '1px solid var(--border)' }}>
      {TABS.map(tab => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link key={tab.href} href={tab.href}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg -mb-px"
            style={{
              color: active ? 'var(--accent)' : 'var(--text-muted)',
              background: active ? 'var(--surface2)' : 'transparent',
              border: active ? '1px solid var(--border)' : '1px solid transparent',
              borderBottom: active ? '1px solid var(--surface2)' : '1px solid transparent',
            }}>
            <span>{tab.icon}</span>
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
