import './globals.css'

export const metadata = {
  title: 'Smart Home Hub',
  description: 'Monitor and control your smart home devices',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
