"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/lib/auth-context"
import { SelfieFlow } from "./SelfieFlow"

/**
 * Component that automatically shows selfie flow when a user logs in
 * without a linked person_id.
 */
export function SelfieFlowTrigger() {
  const { user, loading } = useAuth()
  const [showSelfieFlow, setShowSelfieFlow] = useState(false)
  const [hasShownThisSession, setHasShownThisSession] = useState(false)

  useEffect(() => {
    // Check if we should show selfie flow
    // Conditions:
    // 1. User is logged in
    // 2. User doesn't have person_id (not linked to a person yet)
    // 3. Haven't shown this session already

    if (loading) return

    if (user && !user.person_id && !hasShownThisSession) {
      // Small delay to let the page load first
      const timer = setTimeout(() => {
        setShowSelfieFlow(true)
        setHasShownThisSession(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [user, loading, hasShownThisSession])

  // Don't render anything if no user or user already has person_id
  if (!user || user.person_id) {
    return null
  }

  return (
    <SelfieFlow
      userId={user.id}
      open={showSelfieFlow}
      onOpenChange={setShowSelfieFlow}
    />
  )
}
