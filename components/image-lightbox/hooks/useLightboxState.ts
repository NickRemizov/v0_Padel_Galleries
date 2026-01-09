"use client"

/**
 * Lightbox State Hook
 * 
 * Manages core lightbox state:
 * - UI visibility
 * - Verified people
 * - Copy notification
 * - Comments panel
 */

import { useState, useEffect } from "react"
import type { VerifiedPerson, LightboxImage } from "../types"

export function useLightboxState(currentImage: LightboxImage | undefined) {
  const [showCopied, setShowCopied] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [verifiedPeople, setVerifiedPeople] = useState<VerifiedPerson[]>([])
  const [hideUI, setHideUI] = useState(false)

  // Fetch linked people when image changes (includes verified and recognized)
  useEffect(() => {
    const fetchLinkedPeople = async () => {
      if (!currentImage?.id) {
        setVerifiedPeople([])
        return
      }

      try {
        const response = await fetch(`/api/images/${currentImage.id}/people`)
        const result = await response.json()

        // Handle unified API response format: {success, data, error, code}
        if (result.success && Array.isArray(result.data)) {
          setVerifiedPeople(result.data)
        } else {
          setVerifiedPeople([])
        }
      } catch (error) {
        console.error("[v0] Error fetching linked people:", error)
        setVerifiedPeople([])
      }
    }

    fetchLinkedPeople()
  }, [currentImage?.id])

  const toggleUI = () => setHideUI(prev => !prev)
  const toggleComments = () => setShowComments(prev => !prev)
  
  const showCopiedNotification = () => {
    setShowCopied(true)
    setTimeout(() => setShowCopied(false), 2000)
  }

  return {
    showCopied,
    showComments,
    verifiedPeople,
    hideUI,
    toggleUI,
    toggleComments,
    showCopiedNotification,
  }
}
