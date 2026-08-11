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
      boletin_publicaciones: {
        Row: BoletinPublicacion
        Insert: {
          fecha: string
          edicion: number
          categoria: string
          nombre: string
          titular?: string | null
          region?: string | null
          provincia?: string | null
          cve?: string | null
          url_pdf?: string | null
          expediente_key?: string | null
        }
        Update: Record<string, never>
        Relationships: []
      }
      expedientes: {
        Row: ExpedienteRow
        Insert: {
          expediente_key: string
          nombre?: string | null
          titular?: string | null
          region?: string | null
          comuna?: string | null
          juzgado?: string | null
          causa_rol?: string | null
          conservador?: string | null
          inscripcion_fs?: string | null
          inscripcion_date?: string | null
          area_ha?: string | null
          manifestacion_presentac?: string | null
          manifestacion_orden?: string | null
          manifestacion_inscripcion?: string | null
          manifestacion_publicacion?: string | null
          mensura_solicitud?: string | null
          mensura_publicacion?: string | null
          sentencia_fecha?: string | null
          plazo_mensura?: string | null
          plazo_vigencia?: string | null
          etapa_actual?: string | null
          etapa_anterior?: string | null
          etapa_cambiada_at?: string | null
          revisado_at?: string | null
          publicaciones_count?: number
          updated_at?: string
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
  // Campos extraídos del PDF
  doc: string | null
  juzgado: string | null
  causa_rol: string | null
  comuna: string | null
  norte: string | null
  este: string | null
  alto: string | null
  ancho: string | null
  area_ha: string | null
  orden: string | null
  inscripcion_fs: string | null
  inscripcion_date: string | null
  conservador: string | null
  observaciones: string | null
  pdf_parsed: boolean | null
  created_at: string
  // Clave de agrupación por expediente — ver src/lib/expedienteKey.ts
  expediente_key: string | null
}

// Estado consolidado por trámite — ver src/lib/expedientes.ts
export type ExpedienteRow = {
  id: string
  expediente_key: string
  nombre: string | null
  titular: string | null
  region: string | null
  comuna: string | null
  juzgado: string | null
  causa_rol: string | null
  conservador: string | null
  inscripcion_fs: string | null
  inscripcion_date: string | null
  area_ha: string | null
  manifestacion_presentac: string | null
  manifestacion_orden: string | null
  manifestacion_inscripcion: string | null
  manifestacion_publicacion: string | null
  mensura_solicitud: string | null
  mensura_publicacion: string | null
  sentencia_fecha: string | null
  plazo_mensura: string | null
  plazo_vigencia: string | null
  etapa_actual: string | null
  etapa_anterior: string | null
  etapa_cambiada_at: string | null
  revisado_at: string | null
  publicaciones_count: number
  created_at: string
  updated_at: string
}
