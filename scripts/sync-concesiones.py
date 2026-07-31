#!/usr/bin/env python3
"""
sync-concesiones.py
Descarga el catastro completo de concesiones mineras desde SERNAGEOMIN
y lo guarda en Supabase (tabla concesiones con PostGIS).

Requisitos:
  pip3 install requests   # (solo si quieres usar requests; sino usa urllib ya incluido)
  # En realidad solo usa la librería estándar: urllib, json, os, sys

Variables de entorno:
  export NEXT_PUBLIC_SUPABASE_URL=https://XXXX.supabase.co
  export SUPABASE_SERVICE_ROLE_KEY=eyJ...

Uso:
  python3 scripts/sync-concesiones.py              # sync completo (~80k features)
  python3 scripts/sync-concesiones.py --limite 5000  # solo primeras 5000
  python3 scripts/sync-concesiones.py --dry-run      # no escribe en Supabase
"""

import os, sys, json, time, argparse
import urllib.request, urllib.parse

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('ERROR: Faltan variables NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
    sys.exit(1)

SERNAGEOMIN = 'https://arcgisawa.sernageomin.cl/server/rest/services/VIEW_WGS84/FeatureServer/2'
BATCH       = 1000   # features por petición
UA          = {'User-Agent': 'Mozilla/5.0'}

# ── Supabase helpers ──────────────────────────────────────────────────────────

SB_HEADERS = {
    'apikey':        SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type':  'application/json',
    'Prefer':        'resolution=merge-duplicates,return=minimal',
}

def sb_upsert(rows: list[dict]) -> int:
    body = json.dumps(rows).encode()
    req  = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/concesiones',
        data=body, headers=SB_HEADERS, method='POST',
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status

def sb_count() -> int:
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/concesiones?select=objectid&limit=1',
        headers={**SB_HEADERS, 'Prefer': 'count=exact'},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        cr = r.headers.get('Content-Range', '*/0')
        return int(cr.split('/')[-1])

# ── SERNAGEOMIN helpers ───────────────────────────────────────────────────────

def esri_json(path: str, params: dict) -> dict:
    qs  = urllib.parse.urlencode({**params, 'f': 'json'})
    req = urllib.request.Request(f'{SERNAGEOMIN}/{path}?{qs}', headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read().decode())

def esri_geojson(params: dict) -> dict:
    qs  = urllib.parse.urlencode({**params, 'f': 'geojson'})
    req = urllib.request.Request(f'{SERNAGEOMIN}/query?{qs}', headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())

def get_max_objectid() -> int:
    stats = json.dumps([{
        'statisticType': 'max',
        'onStatisticField': 'OBJECTID',
        'outStatisticFieldName': 'max_oid',
    }])
    data = esri_json('query', {'where': '1=1', 'outStatistics': stats})
    return int(data['features'][0]['attributes']['max_oid'])

# ── Geometry conversion ───────────────────────────────────────────────────────

def ring_wkt(ring: list) -> str:
    return '(' + ','.join(f'{round(x,6)} {round(y,6)}' for x, y in ring) + ')'

def polygon_wkt(polygon: list) -> str:
    return '(' + ','.join(ring_wkt(r) for r in polygon) + ')'

def geojson_to_ewkt(geom: dict | None) -> str | None:
    if not geom:
        return None
    t     = geom.get('type', '')
    coords = geom.get('coordinates', [])
    try:
        if t == 'Polygon':
            wkt = f'MULTIPOLYGON({polygon_wkt(coords)})'
        elif t == 'MultiPolygon':
            parts = ','.join(polygon_wkt(p) for p in coords)
            wkt   = f'MULTIPOLYGON({parts})'
        else:
            return None
        return f'SRID=4326;{wkt}'
    except Exception:
        return None

# ── Feature → DB row ──────────────────────────────────────────────────────────

def to_row(feature: dict) -> dict | None:
    p = feature.get('properties') or {}
    g = geojson_to_ewkt(feature.get('geometry'))
    if not g or p.get('OBJECTID') is None:
        return None
    return {
        'objectid':              int(p['OBJECTID']),
        'numero_rol':            p.get('NUMERO_ROL'),
        'dv_rol':                p.get('DV_ROL'),
        'nombre':                p.get('NOMBRE'),
        'tipo_concesion':        p.get('TIPO_CONCESION'),
        'situacion_concesion':   p.get('SITUACION_CONCESION'),
        'titular_nombre':        p.get('TITULAR_NOMBRE'),
        'titular_rut':           p.get('TITULAR_RUT'),
        'titular_dv':            p.get('TITULAR_DV'),
        'titular_division':      p.get('TITULAR_DIVISION'),
        'hectareas':             p.get('HECTAREAS'),
        'comuna':                p.get('COMUNA'),
        'fecha_vencimiento':     p.get('FECHA_VENCIMIENTO'),
        'nro_inscripcion':       p.get('NRO_INSCRIPCION'),
        'fojas':                 p.get('FOJAS'),
        'ano_inscripcion':       p.get('ANO_INSCRIPCION'),
        'origen':                p.get('ORIGEN'),
        'estacamento_salitrero': p.get('ESTACAMENTO_SALITRERO'),
        'geometry':              g,
        'synced_at':             'now()',
    }

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limite',  type=int, default=0,     help='Máx features (0=todos)')
    ap.add_argument('--dry-run', action='store_true',     help='No escribe en Supabase')
    args = ap.parse_args()

    print('Consultando OBJECTID máximo en SERNAGEOMIN…')
    max_oid = get_max_objectid()
    print(f'  max OBJECTID = {max_oid:,}')

    total_ok = total_skip = total_err = 0
    batches_ok = 0
    oid = 1

    while oid <= max_oid:
        if args.limite and total_ok >= args.limite:
            break

        oid_end = oid + BATCH - 1
        where   = f'OBJECTID >= {oid} AND OBJECTID <= {oid_end}'
        print(f'  OID {oid:>7,}–{oid_end:<7,}  ', end='', flush=True)

        try:
            data  = esri_geojson({
                'where': where,
                'outFields': '*',
                'returnGeometry': 'true',
                'resultRecordCount': BATCH,
            })
            feats = data.get('features', [])

            if not feats:
                print('vacío')
                oid += BATCH
                time.sleep(0.2)
                continue

            rows = [to_row(f) for f in feats]
            rows = [r for r in rows if r]

            skip = len(feats) - len(rows)
            if skip:
                total_skip += skip

            if rows and not args.dry_run:
                sb_upsert(rows)

            total_ok += len(rows)
            batches_ok += 1
            print(f'✓ {len(rows):4} {"(dry-run)" if args.dry_run else ""}')

        except KeyboardInterrupt:
            print('\n⏹  Interrumpido')
            break
        except Exception as e:
            print(f'✗ {e}')
            total_err += 1
            time.sleep(2)

        oid += BATCH
        time.sleep(0.4)

    print(f'\n{"─"*50}')
    print(f'✓ {total_ok:,} concesiones sincronizadas')
    if total_skip: print(f'⚠  {total_skip:,} sin geometría (ignoradas)')
    if total_err:  print(f'✗  {total_err} lotes con error')
    if not args.dry_run:
        try:
            n = sb_count()
            print(f'📦 Total en Supabase: {n:,} filas')
        except Exception:
            pass

if __name__ == '__main__':
    main()
