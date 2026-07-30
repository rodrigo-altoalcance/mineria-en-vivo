#!/usr/bin/env python3
"""
parse-boletin-pdfs.py — Descarga y parsea PDFs del Boletín Oficial de Minería.
Extrae campos estructurados y actualiza la tabla boletin_publicaciones en Supabase.

Requisitos:
  pip3 install pdfplumber

Variables de entorno requeridas (puedes copiar desde Vercel o Supabase dashboard):
  export NEXT_PUBLIC_SUPABASE_URL=https://XXXXXX.supabase.co
  export SUPABASE_SERVICE_ROLE_KEY=eyJ...

Uso:
  python3 scripts/parse-boletin-pdfs.py
  python3 scripts/parse-boletin-pdfs.py --reprocesar   # reparsear aunque ya estén marcados
"""

import os, sys, re, json, time, io, argparse
import urllib.request
import pdfplumber

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '').rstrip('/')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('ERROR: Faltan variables NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
    sys.exit(1)

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
}

# ── Supabase helpers ──────────────────────────────────────────────────────────

def sb_get(path):
    req = urllib.request.Request(f'{SUPABASE_URL}/rest/v1/{path}', headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())

def sb_patch(table, row_id, data):
    url = f'{SUPABASE_URL}/rest/v1/{table}?id=eq.{row_id}'
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers={**HEADERS, 'Prefer': 'return=minimal'}, method='PATCH')
    with urllib.request.urlopen(req) as r:
        return r.status

# ── PDF download + text extraction ───────────────────────────────────────────

def download_pdf(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read()

def extract_text(pdf_bytes):
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        return '\n'.join(page.extract_text() or '' for page in pdf.pages)

# ── Field extraction ──────────────────────────────────────────────────────────

def find(pattern, text, group=1, flags=re.IGNORECASE | re.MULTILINE):
    m = re.search(pattern, text, flags)
    return m.group(group).strip() if m else None

def clean_num(s):
    """'6.257.400,00' → '6257400.00' (punto decimal)"""
    if not s:
        return s
    s = s.strip()
    # Chilean number format: dots as thousands sep, comma as decimal
    if ',' in s:
        s = s.replace('.', '').replace(',', '.')
    else:
        s = s.replace('.', '')
    return s

def parse_fields(text):
    # ── Tipo de documento ─────────────────────────────────────────────────────
    doc = find(
        r'\n(PEDIMENTO MINERO|MANIFESTACI[OÓ]N MINERA|SOLICITUD DE MENSURA'
        r'|OPOSICI[OÓ]N DE MENSURA'
        r'|PR[OÓ]RROGA(?:\s+DE CONCESI[OÓ]N)?\s+DE EXPLORACI[OÓ]N'
        r'|PR[OÓ]RROGA(?:\s+DE CONCESI[OÓ]N)?\s+DE EXPLOTACI[OÓ]N'
        r'|EXTRACTO DE SENTENCIA|RENUNCIA)',
        text,
    )

    # ── CAUSA ROL (rol judicial, e.g. V-163-2026) ────────────────────────────
    causa_rol = find(r'CAUSA ROL[:\s]+([A-Z]+-?\d+-\d{4})', text)

    # ── JUZGADO ───────────────────────────────────────────────────────────────
    juzgado = find(r'JUZGADO[:\s]+(.+?)(?:CAUSA ROL|$)', text)

    # ── Coordenadas UTM ───────────────────────────────────────────────────────
    norte_raw = find(r'NORTE[:\s=]*\*?\s*([\d\.,]+)\s*metros?', text)
    este_raw  = find(r'ESTE[:\s=]*\*?\s*([\d\.,]+)\s*metros?', text)
    norte = clean_num(norte_raw)
    este  = clean_num(este_raw)

    # ── Superficie ────────────────────────────────────────────────────────────
    area_raw = find(r'superficie de ([\d\.,]+)\s*hect[aá]reas?', text)
    area_ha  = clean_num(area_raw)

    # ── Dimensiones NS / EO ───────────────────────────────────────────────────
    # Formato A: "medirán 1.000 metros" tras "Norte-Sur"
    alto_raw  = find(r'Norte-Sur\s+U\.?T\.?M\.?\s+medirán?\s+([\d\.,]+)\s*metros?', text)
    ancho_raw = find(r'Este-Oeste\s+U\.?T\.?M\.?\s+medirán?\s+([\d\.,]+)\s*metros?', text)
    # Formato B: "miden 3.000 metros por 1.000 metros en el sentido Este-Oeste"
    if not alto_raw:
        alto_raw  = find(r'Norte-Sur\s+UTM\s+miden?\s+([\d\.,]+)\s+metros?', text)
    if not ancho_raw:
        ancho_raw = find(r'Este-Oeste\s+UTM\s+(?:por\s+)?([\d\.,]+)\s*metros?', text)
    alto  = clean_num(alto_raw)
    ancho = clean_num(ancho_raw)

    # ── ORDEN (repertorio / número en el Conservador) ─────────────────────────
    orden = find(r'(?:REPERTORIO|REP\.?:?)\s*([\d]+)', text)

    # ── INSCRIPCION_FS (Fojas y N° en el Registro) ───────────────────────────
    inscripcion_fs = find(r'((?:FS|FOJAS)\s*[\d]+\s*N[°º\.]\s*[\d]+)', text)

    # ── INSCRIPCION_DATE ──────────────────────────────────────────────────────
    # Busca "24 de Julio de 2026" o "24 de Julio del año 2026"
    inscripcion_date = find(
        r'(\d{1,2}\s+de\s+[A-Za-záéíóú]+\s+(?:del?\s+año\s+)?\d{4})',
        text,
    )

    # ── CONSERVADOR ───────────────────────────────────────────────────────────
    # "Firmado digitalmente por: NOMBRE APELLIDO APELLIDO"
    conservador = find(r'Firmado digitalmente por[:\s]+([A-ZÁÉÍÓÚÑ][^\n]+?)(?:\s+Fecha|$)', text)
    if not conservador:
        # Fallback: nombre completo en mayúsculas tras "NOTARIO"
        conservador = find(r'NOTARIO\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+?)(?:\s+Conservador|\n)', text)

    # ── COMUNA ────────────────────────────────────────────────────────────────
    # "en la comuna de Melipilla, provincia de..."
    comuna = find(
        r'(?:la\s+)?(?:ciudad\s+y\s+)?[Cc]omuna\s+de\s+([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ\s]+?)'
        r'(?:,|\.|;|\s+(?:Provincia|Región|provincia|región))',
        text,
    )

    return {
        'doc':              doc,
        'juzgado':          juzgado,
        'causa_rol':        causa_rol,
        'comuna':           comuna,
        'norte':            norte,
        'este':             este,
        'area_ha':          area_ha,
        'alto':             alto,
        'ancho':            ancho,
        'orden':            orden,
        'inscripcion_fs':   inscripcion_fs,
        'inscripcion_date': inscripcion_date,
        'conservador':      conservador,
        'pdf_parsed':       True,
    }

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--reprocesar', action='store_true',
                        help='Reparsear entradas ya marcadas como procesadas')
    parser.add_argument('--limite', type=int, default=500)
    args = parser.parse_args()

    filter_parsed = '' if args.reprocesar else '&pdf_parsed=is.false'
    path = (f'boletin_publicaciones'
            f'?select=id,nombre,url_pdf'
            f'&url_pdf=not.is.null'
            f'{filter_parsed}'
            f'&order=fecha.desc'
            f'&limit={args.limite}')

    rows = sb_get(path)
    print(f'{len(rows)} PDFs a procesar\n')

    ok = err = 0
    for i, row in enumerate(rows, 1):
        nombre = row['nombre']
        url    = row['url_pdf']
        print(f'[{i}/{len(rows)}] {nombre} ... ', end='', flush=True)
        try:
            pdf_bytes = download_pdf(url)
            text      = extract_text(pdf_bytes)
            fields    = parse_fields(text)
            sb_patch('boletin_publicaciones', row['id'], fields)
            print(f'✓  ROL={fields.get("causa_rol") or "?"} '
                  f'N={fields.get("norte") or "?"} '
                  f'E={fields.get("este") or "?"}')
            ok += 1
        except Exception as exc:
            sb_patch('boletin_publicaciones', row['id'], {'pdf_parsed': True})
            print(f'✗  {exc}')
            err += 1
        time.sleep(0.3)

    print(f'\n✓ {ok} procesados  ✗ {err} errores')

if __name__ == '__main__':
    main()
