import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Minería en Vivo — Catastro de Concesiones',
  description: 'Plataforma de inteligencia minera en tiempo real. Concesiones SERNAGEOMIN y Boletín Oficial de Minería en un solo lugar.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className="h-full">
      <body className={`${inter.className} h-full antialiased`}>
        {children}
      </body>
    </html>
  )
}
