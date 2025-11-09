import type { Metadata } from 'next'
import { initializeMonitoring } from './startup'

export const metadata: Metadata = {
  title: 'WanWatch',
  description: 'Monitor your internet connection and track outages',
}

// Initialize monitoring when the app starts
if (typeof window === 'undefined') {
  initializeMonitoring();
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        padding: 0,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        background: '#f9fafb'
      }}>
        {children}
      </body>
    </html>
  )
}
