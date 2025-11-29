import { Outlet } from 'react-router-dom'
import { Header } from '@/client/components/marketing/Header'
import { Footer } from '@/client/components/marketing/Footer'
import { VoiceWidget } from '@/client/components/shared/VoiceWidget'

/**
 * Public layout for marketing/informational pages
 * Provides consistent header and footer for all public pages
 */
export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />

      {/* ElevenLabs Voice Widget for public visitors */}
      <VoiceWidget />
    </div>
  )
}
