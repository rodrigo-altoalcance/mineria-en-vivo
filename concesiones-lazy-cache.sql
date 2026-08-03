-- ════════════════════════════════════════════════════════════════════════════
-- concesiones-lazy-cache.sql
-- Función para guardar polígonos de SERNAGEOMIN en la caché local.
-- Ejecutar UNA SOLA VEZ en el SQL Editor de Supabase.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION upsert_concesiones_batch(features jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  feat jsonb;
  n    integer := 0;
BEGIN
  FOR feat IN SELECT * FROM jsonb_array_elements(features)
  LOOP
    BEGIN
      INSERT INTO concesiones (
        objectid,
        numero_rol,
        dv_rol,
        nombre,
        tipo_concesion,
        situacion_concesion,
        titular_nombre,
        titular_rut,
        titular_dv,
        titular_division,
        hectareas,
        comuna,
        fecha_vencimiento,
        nro_inscripcion,
        fojas,
        ano_inscripcion,
        origen,
        estacamento_salitrero,
        geometry,
        synced_at
      ) VALUES (
        (feat->'properties'->>'OBJECTID')::integer,
        NULLIF(feat->'properties'->>'NUMERO_ROL', '')::bigint,
        NULLIF(feat->'properties'->>'DV_ROL', ''),
        feat->'properties'->>'NOMBRE',
        feat->'properties'->>'TIPO_CONCESION',
        feat->'properties'->>'SITUACION_CONCESION',
        NULLIF(feat->'properties'->>'TITULAR_NOMBRE', ''),
        NULLIF(feat->'properties'->>'TITULAR_RUT', '')::bigint,
        NULLIF(feat->'properties'->>'TITULAR_DV', ''),
        NULLIF(feat->'properties'->>'TITULAR_DIVISION', ''),
        NULLIF(feat->'properties'->>'HECTAREAS', '')::numeric,
        NULLIF(feat->'properties'->>'COMUNA', ''),
        NULLIF(feat->'properties'->>'FECHA_VENCIMIENTO', ''),
        NULLIF(feat->'properties'->>'NRO_INSCRIPCION', ''),
        NULLIF(feat->'properties'->>'FOJAS', ''),
        NULLIF(feat->'properties'->>'ANO_INSCRIPCION', ''),
        NULLIF(feat->'properties'->>'ORIGEN', ''),
        NULLIF(feat->'properties'->>'ESTACAMENTO_SALITRERO', ''),
        ST_SetSRID(ST_GeomFromGeoJSON(feat->>'geometry'), 4326),
        now()
      )
      ON CONFLICT (objectid) DO UPDATE SET
        situacion_concesion = EXCLUDED.situacion_concesion,
        titular_nombre      = EXCLUDED.titular_nombre,
        synced_at           = now();
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Ignorar features con geometría inválida u otros errores
      NULL;
    END;
  END LOOP;
  RETURN n;
END;
$$;
