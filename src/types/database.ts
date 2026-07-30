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

export type FavoritoRow = {
  id: string
  user_id: string
  numero_rol: string
  dv_rol: string | null
  nombre: string | null
  tipo_concesion: string | null
  situacion_concesion: string | null
  titular_nombre: string | null
  comuna: string | null
  created_at: string
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
      favoritos: {
        Row: FavoritoRow
        Insert: {
          user_id: string
          numero_rol: string
          dv_rol?: string | null
          nombre?: string | null
          tipo_concesion?: string | null
          situacion_concesion?: string | null
          titular_nombre?: string | null
          comuna?: string | null
        }
        Update: Record<string, never>
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

export type BoletinCategoria =
  | 'Manifestación Minera'
  | 'Solicitud de Mensura'
  | 'Prórroga Exploración'
  | 'Prórroga Explotación'
  | 'Pedimento Minero'
  | 'Otra'

export type BoletinPublicacion = {
  id: string
  fecha: string
  edicion: number
  categoria: string
  nombre: string
  titular: string | null
  region: string | null
  provincia: string | null
  cve: string | null
  url_pdf: string | null
  created_at: string
}
