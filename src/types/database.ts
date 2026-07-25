export type Role = 'user' | 'admin'
export type Plan = 'free' | 'pro' | 'enterprise'

export type ProfileRow = {
  id: string
  email: string
  full_name: string | null
  role: Role
  plan: Plan
  plan_expires_at: string | null
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: Role
          plan?: Plan
          plan_expires_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          full_name?: string | null
          role?: Role
          plan?: Plan
          plan_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export type Profile = ProfileRow
