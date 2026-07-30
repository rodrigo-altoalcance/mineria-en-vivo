-- Tabla para publicaciones del Boletín Oficial de Minería
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS boletin_publicaciones (
  id          uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha       date    NOT NULL,
  edicion     integer NOT NULL,
  categoria   text    NOT NULL,
  nombre      text    NOT NULL,
  titular     text,
  region      text,
  provincia   text,
  cve         text,
  url_pdf     text,
  created_at  timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS boletin_fecha_idx     ON boletin_publicaciones (fecha DESC);
CREATE INDEX IF NOT EXISTS boletin_categoria_idx ON boletin_publicaciones (categoria);
CREATE INDEX IF NOT EXISTS boletin_region_idx    ON boletin_publicaciones (region);

-- Evitar duplicados por CVE (el Diario Oficial asigna un CVE único a cada publicación)
CREATE UNIQUE INDEX IF NOT EXISTS boletin_cve_uniq ON boletin_publicaciones (cve)
  WHERE cve IS NOT NULL;

-- RLS
ALTER TABLE boletin_publicaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "boletin_auth_read"
  ON boletin_publicaciones FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "boletin_service_insert"
  ON boletin_publicaciones FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "boletin_service_delete"
  ON boletin_publicaciones FOR DELETE
  TO service_role USING (true);
