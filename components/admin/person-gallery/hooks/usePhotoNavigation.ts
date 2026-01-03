"use client"

import { useState, useCallback } from "react"
import type { PersonPhoto, TaggingImageState } from "../types"

interface UsePhotoNavigationProps {
  sortedPhotos: PersonPhoto[]
  photos: PersonPhoto[]
}

/**
 * Hook for photo navigation in tagging dialog
 */
export function usePhotoNavigation({ sortedPhotos, photos }: UsePhotoNavigationProps) {
  const [taggingImage, setTaggingImage] = useState<TaggingImageState | null>(null)

  // Find neighbors in sorted list
  const findNeighbors = useCallback((photoId: string): { prevId: string | null; nextId: string | null } => {
    const index = sortedPhotos.findIndex((p) => p.id === photoId)
    return {
      prevId: index > 0 ? sortedPhotos[index - 1].id : null,
      nextId: index < sortedPhotos.length - 1 ? sortedPhotos[index + 1].id : null,
    }
  }, [sortedPhotos])

  // Open tagging dialog
  const openTaggingDialog = useCallback((photoId: string, imageUrl: string) => {
    const photo = photos.find((p) => p.id === photoId)
    const neighbors = findNeighbors(photoId)
    setTaggingImage({
      id: photoId,
      url: imageUrl,
      originalFilename: photo?.filename || "",
      prevId: neighbors.prevId,
      nextId: neighbors.nextId,
    })
  }, [photos, findNeighbors])

  // Close tagging dialog
  const closeTaggingDialog = useCallback(() => {
    setTaggingImage(null)
  }, [])

  // Navigate to previous
  const goToPrevious = useCallback(() => {
    if (!taggingImage?.prevId) return

    const prevPhoto = photos.find((p) => p.id === taggingImage.prevId)
    if (!prevPhoto) return

    const neighbors = findNeighbors(prevPhoto.id)
    setTaggingImage({
      id: prevPhoto.id,
      url: prevPhoto.image_url,
      originalFilename: prevPhoto.filename || "",
      prevId: neighbors.prevId,
      nextId: neighbors.nextId,
    })
  }, [taggingImage, photos, findNeighbors])

  // Navigate to next
  const goToNext = useCallback(() => {
    if (!taggingImage?.nextId) return

    const nextPhoto = photos.find((p) => p.id === taggingImage.nextId)
    if (!nextPhoto) return

    const neighbors = findNeighbors(nextPhoto.id)
    setTaggingImage({
      id: nextPhoto.id,
      url: nextPhoto.image_url,
      originalFilename: nextPhoto.filename || "",
      prevId: neighbors.prevId,
      nextId: neighbors.nextId,
    })
  }, [taggingImage, photos, findNeighbors])

  return {
    taggingImage,
    openTaggingDialog,
    closeTaggingDialog,
    goToPrevious,
    goToNext,
  }
}
