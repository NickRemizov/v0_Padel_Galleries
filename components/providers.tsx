"use client"

import { Suspense } from "react"
import { GoogleOAuthProvider } from "@react-oauth/google"
import { AuthProvider } from "@/lib/auth-context"
import { WelcomeDialog } from "@/components/welcome-dialog"
import { SelfieFlowTrigger } from "@/components/selfie"
import { PostHogProvider } from "@/components/posthog-provider"

interface ProvidersProps {
  children: React.ReactNode
  googleClientId?: string
}

export function Providers({ children, googleClientId }: ProvidersProps) {
  // Wrap with GoogleOAuthProvider only if client ID is configured
  const content = (
    <PostHogProvider>
      <AuthProvider>
        {children}
        <WelcomeDialog />
        <SelfieFlowTrigger />
      </AuthProvider>
    </PostHogProvider>
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
