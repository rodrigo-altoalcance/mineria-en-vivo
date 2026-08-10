'use client'

// Modal de advertencia genérico (Deep-Core Precision). Mismo chrome visual
// que InviteModal (overlay + card), reutilizable para cualquier aviso que
// requiera confirmación del usuario con un solo botón.

interface Props {
  title: string
  message: string
  onClose: () => void
  confirmLabel?: string
}

export default function AlertDialog({ title, message, onClose, confirmLabel = 'Entendido' }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border-dim)' }}>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}>✕</button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {message}
          </p>

          <button onClick={onClose}
            className="w-full py-2 rounded text-xs font-bold"
            style={{ background: 'var(--accent)', color: '#00164d' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
