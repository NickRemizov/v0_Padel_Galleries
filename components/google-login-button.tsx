"use client"

import { GoogleLogin, CredentialResponse } from "@react-oauth/google"

interface GoogleLoginButtonProps {
  onAuth: (user: any) => void
  onError?: () => void
}

export function GoogleLoginButton({ onAuth, onError }: GoogleLoginButtonProps) {
  async function handleSuccess(credentialResponse: CredentialResponse) {
    if (!credentialResponse.credential) {
      console.error("[v0] Google login: no credential")
      onError?.()
      return
    }

    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      })

      if (response.ok) {
        const data = await response.json()
        onAuth(data.user)
      } else {
        console.error("[v0] Google login failed:", await response.text())
        onError?.()
      }
    } catch (error) {
      console.error("[v0] Google login error:", error)
      onError?.()
    }
  }

  function handleError() {
    console.error("[v0] Google login failed")
    onError?.()
  }

  return (
    <GoogleLogin
      onSuccess={handleSuccess}
      onError={handleError}
      size="large"
      shape="rectangular"
      text="signin_with"
      locale="ru"
    />
  )
}
