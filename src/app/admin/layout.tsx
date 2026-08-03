import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import AdminNav from '@/components/admin/AdminNav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Usar admin client para bypass de RLS — más confiable en contexto de layout
  const adminClient = createAdminClient()
  const { data: profile } = await adminClient.from('profiles').select('*').eq('id', user.id).single()
  if (profile?.role !== 'admin') redirect('/mapa')

  return (
    <AppShell profile={profile}>
      <div className="h-full flex flex-col overflow-hidden">
        <AdminNav />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </AppShell>
  )
}
