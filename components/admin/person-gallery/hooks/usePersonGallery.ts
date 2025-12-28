"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import type { PersonPhoto, VerifyButtonState } from "../types"
import { sortPhotos } from "../utils"
import {
  getPersonPhotosWithDetailsAction,
  unlinkPersonFromPhotoAction,
  verifyPersonOnPhotoAction,
  batchVerifyPersonOnPhotosAction,
} from "@/app/admin/actions"

interface UsePersonGalleryProps {
  personId: string
  open: boolean
}

/**
 * Hook for person gallery data and operations
 */
export function usePersonGallery({ personId, open }: UsePersonGalleryProps) {
  const [photos, setPhotos] = useState<PersonPhoto[]>([])
  const [loading, setLoading] = useState(false)
  const [showUnverifiedFirst, setShowUnverifiedFirst] = useState(false)

  // Load photos when dialog opens
  const loadPhotos = useCallback(async () => {
    setLoading(true)
    const result = await getPersonPhotosWithDetailsAction(personId)
    console.log("[PersonGallery] Loaded photos:", result.data?.length)
    if (result.success && result.data) {
      setPhotos(result.data)
    } else if (result.error) {
      console.error("[PersonGallery] Error loading photos:", result.error)
    }
    setLoading(false)
  }, [personId])

  useEffect(() => {
    if (open) {
      loadPhotos()
    }
  }, [open, personId, loadPhotos])

  // Sorted photos
  const sortedPhotos = useMemo(() => {
    return sortPhotos(photos, showUnverifiedFirst)
  }, [photos, showUnverifiedFirst])

  // Counts
  const unverifiedCount = useMemo(() => {
    return photos.filter((p) => !p.verified).length
  }, [photos])

  // Verify single photo
  const verifyPhoto = useCallback(async (photoId: string) => {
    console.log("[PersonGallery] Verifying photo:", photoId)
    const result = await verifyPersonOnPhotoAction(photoId, personId)
    if (result.success) {
      setPhotos((prev) =>
        prev.map((photo) => (photo.id === photoId ? { ...photo, verified: true, confidence: 1 } : photo))
      )
    } else {
      console.error("[PersonGallery] Verify failed:", result.error)
    }
    return result.success
  }, [personId])

  // Batch verify photos
  const batchVerifyPhotos = useCallback(async (photoIds: string[]) => {
    console.log("[PersonGallery] Batch verifying", photoIds.length, "photos")
    const result = await batchVerifyPersonOnPhotosAction(personId, photoIds)
    if (result.success) {
      setPhotos((prev) =>
        prev.map((photo) =>
          photoIds.includes(photo.id) ? { ...photo, verified: true, confidence: 1 } : photo
        )
      )
    } else {
      console.error("[PersonGallery] Batch verify failed:", result.error)
      throw new Error(result.error)
    }
    return result.success
  }, [personId])

  // Delete single photo (unlink person)
  const deletePhoto = useCallback(async (photoId: string) => {
    // Optimistic update
    setPhotos((prev) => prev.filter((photo) => photo.id !== photoId))
    
    console.log("[PersonGallery] Unlinking photo:", photoId)
    const result = await unlinkPersonFromPhotoAction(photoId, personId)
    
    if (!result.success) {
      console.error("[PersonGallery] Unlink failed:", result.error)
      await loadPhotos() // Reload on error
    }
    return result.success
  }, [personId, loadPhotos])

  // Batch delete photos
  const batchDeletePhotos = useCallback(async (photoIds: string[]) => {
    // Optimistic update
    const photoIdSet = new Set(photoIds)
    setPhotos((prev) => prev.filter((photo) => !photoIdSet.has(photo.id)))
    
    // Process deletions in background
    let hasError = false
    for (const photoId of photoIds) {
      const result = await unlinkPersonFromPhotoAction(photoId, personId)
      if (!result.success) {
        hasError = true
        console.error("[PersonGallery] Batch unlink failed:", result.error)
      }
    }
    
    if (hasError) {
      await loadPhotos() // Reload on error
    }
    return !hasError
  }, [personId, loadPhotos])

  // Update photo after tagging dialog
  const updatePhotoFromTagging = useCallback((imageId: string, faces: any[]) => {
    const personFace = faces.find((f: any) => f.personId === personId)
    
    if (personFace) {
      // Person still on photo - update locally
      setPhotos((prev) =>
        prev.map((photo) =>
          photo.id === imageId
            ? { ...photo, verified: personFace.verified, confidence: personFace.recognitionConfidence }
            : photo
        )
      )
      console.log("[PersonGallery] Updated photo locally:", imageId)
    } else {
      // Person was removed - remove from list
      setPhotos((prev) => prev.filter((photo) => photo.id !== imageId))
      console.log("[PersonGallery] Removed photo from list:", imageId)
    }
  }, [personId])

  return {
    photos,
    sortedPhotos,
    loading,
    unverifiedCount,
    showUnverifiedFirst,
    setShowUnverifiedFirst,
    loadPhotos,
    verifyPhoto,
    batchVerifyPhotos,
    deletePhoto,
    batchDeletePhotos,
    updatePhotoFromTagging,
  }
}
