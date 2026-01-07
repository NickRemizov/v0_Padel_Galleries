"use client"

import { GoogleOAuthProvider } from "@react-oauth/google"
import { AuthProvider } from "@/lib/auth-context"
import { WelcomeDialog } from "@/components/welcome-dialog"

interface ProvidersProps {
  children: React.ReactNode
  googleClientId?: string
}

export function Providers({ children, googleClientId }: ProvidersProps) {
  // Wrap with GoogleOAuthProvider only if client ID is configured
  const content = (
    <AuthProvider>
      {children}
      <WelcomeDialog />
    </AuthProvider>
  )

  if (googleClientId) {
    return (
      <GoogleOAuthProvider clientId={googleClientId}>
        {content}
      </GoogleOAuthProvider>
    )
  }

  return content
}
