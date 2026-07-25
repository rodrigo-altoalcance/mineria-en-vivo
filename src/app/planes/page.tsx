import Link from 'next/link'

const plans = [
  {
    name: 'Básico',
    price: 'Gratis',
    period: '',
    href: '/register',
    cta: 'Empezar gratis',
    featured: false,
    features: [
      { text: 'Mapa de concesiones (solo lectura)', included: true },
      { text: 'Ficha básica por concesión', included: true },
      { text: 'Acceso al Boletín Oficial', included: false },
      { text: 'Búsqueda por titular o RUT', included: false },
      { text: 'Exportar datos', included: false },
      { text: 'Alertas de cambio', included: false },
    ],
  },
  {
    name: 'Profesional',
    price: 'UF 1,5',
    period: '/ mes',
    href: '/register?plan=pro',
    cta: 'Suscribirse',
    featured: true,
    features: [
      { text: 'Mapa completo sin límites', included: true },
      { text: 'Ficha completa con todos los campos', included: true },
      { text: 'Boletín Oficial (últimos 6 meses)', included: true },
      { text: 'Búsqueda por titular o RUT', included: true },
      { text: 'Exportar a CSV / Excel', included: true },
      { text: 'Alertas de cambio', included: false },
    ],
  },
  {
    name: 'Empresa',
    price: 'A conv.',
    period: '',
    href: 'mailto:contacto@mineriaenvivo.cl',
    cta: 'Contactar',
    featured: false,
    features: [
      { text: 'Todo el plan Profesional', included: true },
      { text: 'Historial completo del Boletín', included: true },
      { text: 'Alertas de cambio por email', included: true },
      { text: 'API de acceso (integración)', included: true },
      { text: 'Múltiples usuarios por cuenta', included: true },
      { text: 'Soporte prioritario', included: true },
    ],
  },
]

export default function PlanesPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text)' }}>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
        className="px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-7 h-7 rounded flex items-center justify-center text-sm font-black"
            style={{ background: 'var(--accent)', color: '#00164d' }}>M</div>
          <span className="font-bold text-sm">Minería en Vivo</span>
        </Link>
        <div className="flex gap-3">
          <Link href="/login" className="text-sm px-4 py-1.5 rounded border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>Ingresar</Link>
          <Link href="/register" className="text-sm px-4 py-1.5 rounded font-semibold"
            style={{ background: 'var(--accent)', color: '#00164d' }}>Registrarse</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
            Planes y precios
          </h1>
          <p className="text-base" style={{ color: 'var(--text-muted)' }}>
            Elige el plan que se adapta a tu actividad. Cancela cuando quieras.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map(plan => (
            <div key={plan.name}
              className="rounded-xl p-6 flex flex-col gap-5"
              style={{
                background: plan.featured ? 'var(--surface2)' : 'var(--surface)',
                border: `1px solid ${plan.featured ? 'var(--accent)' : 'var(--border)'}`,
              }}>
              {plan.featured && (
                <div className="text-xs font-bold tracking-widest uppercase px-2 py-0.5 rounded-full self-start"
                  style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                  Más popular
                </div>
              )}
              <div>
                <div className="text-xs font-bold tracking-widest uppercase mb-2"
                  style={{ color: plan.featured ? 'var(--accent)' : 'var(--text-muted)' }}>
                  {plan.name}
                </div>
                <div className="text-3xl font-extrabold tracking-tight">{plan.price}
                  <span className="text-sm font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                    {plan.period}
                  </span>
                </div>
              </div>

              <ul className="space-y-2 flex-1">
                {plan.features.map(f => (
                  <li key={f.text} className="flex items-center gap-2 text-sm"
                    style={{ color: f.included ? 'var(--text-muted)' : 'var(--text-faint)' }}>
                    <span style={{ color: f.included ? 'var(--ok)' : 'var(--text-faint)' }}>
                      {f.included ? '✓' : '—'}
                    </span>
                    {f.text}
                  </li>
                ))}
              </ul>

              <Link href={plan.href}
                className="block text-center py-2.5 rounded font-bold text-sm"
                style={{
                  background: plan.featured ? 'var(--accent)' : 'var(--surface3)',
                  color: plan.featured ? '#00164d' : 'var(--text)',
                  border: plan.featured ? 'none' : '1px solid var(--border)',
                }}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
