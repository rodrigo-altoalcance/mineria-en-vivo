-- ════════════════════════════════════════════════════════════════════════════
-- concesiones-setup.sql
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- ════════════════════════════════════════════════════════════════════════════

-- 1. PostGIS (ya viene habilitado en Supabase, pero por si acaso)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Tabla principal
CREATE TABLE IF NOT EXISTS concesiones (
  objectid             integer PRIMARY KEY,          -- OBJECTID de SERNAGEOMIN
  numero_rol           bigint,
  dv_rol               text,
  nombre               text,
  tipo_concesion       text,                         -- EXPLORACION | EXPLOTACION
  situacion_concesion  text,                         -- CONSTITUIDA | EN TRAMITE | ELIMINADA
  titular_nombre       text,
  titular_rut          bigint,
  titular_dv           text,
  titular_division     text,
  hectareas            numeric,
  comuna               text,
  fecha_vencimiento    text,
  nro_inscripcion      text,
  fojas                text,
  ano_inscripcion      text,
  origen               text,
  estacamento_salitrero text,
  geometry             geometry(Geometry, 4326),
  synced_at            timestamptz DEFAULT now()
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS concesiones_geom_idx
  ON concesiones USING GIST(geometry);

CREATE INDEX IF NOT EXISTS concesiones_nombre_idx
  ON concesiones (lower(nombre));

CREATE INDEX IF NOT EXISTS concesiones_rol_idx
  ON concesiones (numero_rol)
  WHERE numero_rol IS NOT NULL;

CREATE INDEX IF NOT EXISTS concesiones_sit_idx
  ON concesiones (situacion_concesion);

-- 4. RLS
ALTER TABLE concesiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "concesiones_auth_read"
  ON concesiones FOR SELECT TO authenticated USING (true);

CREATE POLICY "concesiones_service_write"
  ON concesiones FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Función RPC → devuelve GeoJSON FeatureCollection para un bbox
--    Llamada desde /api/concesiones?bbox=west,south,east,north
CREATE OR REPLACE FUNCTION get_concesiones_bbox(
  bbox_west  double precision,
  bbox_south double precision,
  bbox_east  double precision,
  bbox_north double precision,
  max_rows   integer DEFAULT 2000
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    json_agg(feat),
    '[]'::json
  )
  FROM (
    SELECT json_build_object(
      'type',       'Feature',
      'geometry',   ST_AsGeoJSON(geometry, 6)::json,
      'properties', json_build_object(
        'OBJECTID',              objectid,
        'NUMERO_ROL',            numero_rol,
        'DV_ROL',                dv_rol,
        'NOMBRE',                nombre,
        'TIPO_CONCESION',        tipo_concesion,
        'SITUACION_CONCESION',   situacion_concesion,
        'TITULAR_NOMBRE',        titular_nombre,
        'TITULAR_RUT',           titular_rut,
        'TITULAR_DV',            titular_dv,
        'TITULAR_DIVISION',      titular_division,
        'HECTAREAS',             hectareas,
        'COMUNA',                comuna,
        'FECHA_VENCIMIENTO',     fecha_vencimiento,
        'NRO_INSCRIPCION',       nro_inscripcion,
        'FOJAS',                 fojas,
        'ANO_INSCRIPCION',       ano_inscripcion,
        'ORIGEN',                origen,
        'ESTACAMENTO_SALITRERO', estacamento_salitrero
      )
    ) AS feat
    FROM concesiones
    WHERE situacion_concesion <> 'ELIMINADA'
      AND geometry && ST_MakeEnvelope(bbox_west, bbox_south, bbox_east, bbox_north, 4326)
    LIMIT max_rows
  ) sub
$$;
