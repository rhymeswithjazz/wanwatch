import type { Metadata } from 'next'
import { initializeMonitoring } from './startup'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

export const metadata: Metadata = {
  title: {
    template: '%s | WanWatch',
    default: 'WanWatch - Internet Connectivity Monitor',
  },
  description: 'Monitor your internet connection with real-time status tracking and outage history.',
  keywords: ['internet', 'monitoring', 'connectivity', 'uptime', 'network', 'outage tracking'],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'WanWatch',
    title: 'WanWatch - Internet Connectivity Monitor',
    description: 'Monitor your internet connection with real-time status tracking.',
  },
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
