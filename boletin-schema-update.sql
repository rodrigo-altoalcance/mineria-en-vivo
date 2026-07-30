-- Agrega columnas de detalle PDF a boletin_publicaciones
-- Ejecutar en Supabase SQL Editor

ALTER TABLE boletin_publicaciones
  ADD COLUMN IF NOT EXISTS doc              text,
  ADD COLUMN IF NOT EXISTS juzgado          text,
  ADD COLUMN IF NOT EXISTS causa_rol        text,
  ADD COLUMN IF NOT EXISTS comuna           text,
  ADD COLUMN IF NOT EXISTS norte            text,
  ADD COLUMN IF NOT EXISTS este             text,
  ADD COLUMN IF NOT EXISTS alto             text,
  ADD COLUMN IF NOT EXISTS ancho            text,
  ADD COLUMN IF NOT EXISTS area_ha          text,
  ADD COLUMN IF NOT EXISTS orden            text,
  ADD COLUMN IF NOT EXISTS inscripcion_fs   text,
  ADD COLUMN IF NOT EXISTS inscripcion_date text,
  ADD COLUMN IF NOT EXISTS conservador      text,
  ADD COLUMN IF NOT EXISTS observaciones    text,
  ADD COLUMN IF NOT EXISTS pdf_parsed       boolean DEFAULT false;

-- Índice para búsquedas por nombre (link mapa ↔ boletín)
CREATE INDEX IF NOT EXISTS boletin_nombre_idx ON boletin_publicaciones (lower(nombre));
