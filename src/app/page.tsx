import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* Header */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
        className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded flex items-center justify-center text-sm font-black"
            style={{ background: 'var(--accent)', color: '#00164d' }}>M</div>
          <span className="font-bold text-sm tracking-wide">Minería en Vivo</span>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/planes" className="text-sm hidden sm:block"
            style={{ color: 'var(--text-muted)' }}>Planes</Link>
          <Link href="/login"
            className="text-sm px-4 py-1.5 rounded border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            Iniciar sesión
          </Link>
          <Link href="/register"
            className="text-sm px-4 py-1.5 rounded font-semibold"
            style={{ background: 'var(--accent)', color: '#00164d' }}>
            Registrarse
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase mb-6 px-3 py-1 rounded-full"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid rgba(100,138,255,0.2)' }}>
          Datos oficiales · SERNAGEOMIN
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight mb-6 leading-tight"
          style={{ textWrap: 'balance' } as React.CSSProperties}>
          El catastro minero de Chile
          <br />
          <span style={{ color: 'var(--accent)' }}>en tiempo real</span>
        </h1>

        <p className="text-lg max-w-xl mb-10 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          Visualiza, busca y analiza concesiones mineras vigentes y caducadas.
          Integrado con el Boletín Oficial de Minería para seguir cada trámite legal.
        </p>

        <div className="flex gap-3 flex-wrap justify-center">
          <Link href="/register"
            className="px-6 py-3 rounded font-bold text-sm"
            style={{ background: 'var(--accent)', color: '#00164d' }}>
            Comenzar gratis
          </Link>
          <Link href="/planes"
            className="px-6 py-3 rounded font-semibold text-sm border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            Ver planes y precios
          </Link>
        </div>

        <div className="flex flex-wrap gap-3 justify-center mt-14">
          {['Mapa interactivo', 'Datos SERNAGEOMIN', 'Boletín Oficial', 'Búsqueda por RUT', 'Alertas de cambio'].map(f => (
            <span key={f} className="text-xs px-3 py-1.5 rounded-full border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}>
              {f}
            </span>
          ))}
        </div>
      </main>

      <footer className="text-center py-6 text-xs" style={{ color: 'var(--text-faint)', borderTop: '1px solid var(--border-dim)' }}>
        © 2026 Minería en Vivo · Datos: SERNAGEOMIN, Diario Oficial de Chile
      </footer>
    </div>
  )
}
