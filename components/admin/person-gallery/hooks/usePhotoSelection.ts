"use client"

import { useState, useMemo, useCallback } from "react"
import type { PersonPhoto, VerifyButtonState } from "../types"

interface UsePhotoSelectionProps {
  photos: PersonPhoto[]
  unverifiedCount: number
}

/**
 * Hook for photo selection logic
 */
export function usePhotoSelection({ photos, unverifiedCount }: UsePhotoSelectionProps) {
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set())

  // Count selected unverified photos
  const selectedUnverifiedCount = useMemo(() => {
    return Array.from(selectedPhotos).filter((photoId) => {
      const photo = photos.find((p) => p.id === photoId)
      return photo && !photo.verified
    }).length
  }, [selectedPhotos, photos])

  // Toggle photo selection
  const toggleSelection = useCallback((photoId: string) => {
    setSelectedPhotos((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(photoId)) {
        newSet.delete(photoId)
      } else {
        newSet.add(photoId)
      }
      return newSet
    })
  }, [])

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedPhotos(new Set())
  }, [])

  // Get verify button state
  const getVerifyButtonState = useCallback((): VerifyButtonState => {
    if (unverifiedCount === 0) {
      return { disabled: true, text: "Все фото подтверждены", count: 0 }
    }
    
    if (selectedPhotos.size > 0) {
      if (selectedUnverifiedCount > 0) {
        return { disabled: false, text: `Подтвердить ${selectedUnverifiedCount} фото`, count: selectedUnverifiedCount }
      } else {
        return { disabled: true, text: "Все фото подтверждены", count: 0 }
      }
    }
    
    return { disabled: false, text: `Подтвердить все фото (${unverifiedCount})`, count: unverifiedCount }
  }, [unverifiedCount, selectedPhotos.size, selectedUnverifiedCount])

  // Get photos to verify (selected unverified or all unverified)
  const getPhotosToVerify = useCallback((): string[] => {
    if (selectedPhotos.size > 0) {
      return Array.from(selectedPhotos).filter((photoId) => {
        const photo = photos.find((p) => p.id === photoId)
        return photo && !photo.verified
      })
    }
    return photos.filter((p) => !p.verified).map((p) => p.id)
  }, [selectedPhotos, photos])

  // Get selected photos as array
  const getSelectedPhotosArray = useCallback((): string[] => {
    return Array.from(selectedPhotos)
  }, [selectedPhotos])

  return {
    selectedPhotos,
    selectedUnverifiedCount,
    toggleSelection,
    clearSelection,
    getVerifyButtonState,
    getPhotosToVerify,
    getSelectedPhotosArray,
  }
}
