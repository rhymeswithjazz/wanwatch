import type { Metadata } from 'next'
import { initializeMonitoring } from './startup'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

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
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
