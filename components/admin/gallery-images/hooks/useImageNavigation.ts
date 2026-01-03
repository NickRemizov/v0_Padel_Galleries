"use client"

import { useCallback, useMemo } from "react"
import type { GalleryImage } from "@/lib/types"
import type { TaggingImageState, FaceData, SortOption } from "../types"

interface UseImageNavigationOptions {
  images: GalleryImage[]
  sortBy: SortOption
  hideFullyVerified: boolean
  photoFacesMap: Record<string, FaceData[]>
  photoFacesLoaded: boolean
}

interface UseImageNavigationReturn {
  sortedImages: GalleryImage[]
  hiddenCount: number
  findNeighbors: (imageId: string) => { prevId: string | null; nextId: string | null }
  createTaggingState: (imageId: string, imageUrl: string) => TaggingImageState | null
  navigateToPrevious: (
    current: TaggingImageState | null
  ) => TaggingImageState | null
  navigateToNext: (
    current: TaggingImageState | null
  ) => TaggingImageState | null
}

export function useImageNavigation({
  images,
  sortBy,
  hideFullyVerified,
  photoFacesMap,
  photoFacesLoaded,
}: UseImageNavigationOptions): UseImageNavigationReturn {
  // Helper to check if photo should be shown
  const shouldShowPhoto = useCallback(
    (image: GalleryImage): boolean => {
      if (!hideFullyVerified) return true

      const faces = photoFacesMap[image.id]
      const hasBeenProcessed = image.has_been_processed || false

      if (!hasBeenProcessed) return true
      if (hasBeenProcessed && (!faces || faces.length === 0)) return true
      if (faces?.some((face) => face.person_id === null)) return true
      if (faces?.some((face) => !face.verified)) return true

      return false
    },
    [hideFullyVerified, photoFacesMap]
  )

  const sortedImages = useMemo(() => {
    const imagesCopy = [...images]

    let sorted: GalleryImage[]
    switch (sortBy) {
      case "filename":
        sorted = imagesCopy.sort((a, b) =>
          (a.original_filename || "").localeCompare(b.original_filename || "")
        )
        break
      case "created":
      case "added":
        sorted = imagesCopy.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        break
      default:
        sorted = imagesCopy
    }

    if (hideFullyVerified && photoFacesLoaded) {
      return sorted.filter(shouldShowPhoto)
    }

    return sorted
  }, [images, sortBy, hideFullyVerified, photoFacesLoaded, shouldShowPhoto])

  const hiddenCount = useMemo(() => {
    if (!hideFullyVerified || !photoFacesLoaded) return 0
    return images.filter((img) => !shouldShowPhoto(img)).length
  }, [images, hideFullyVerified, photoFacesLoaded, shouldShowPhoto])

  const findNeighbors = useCallback(
    (imageId: string): { prevId: string | null; nextId: string | null } => {
      const index = sortedImages.findIndex((img) => img.id === imageId)
      return {
        prevId: index > 0 ? sortedImages[index - 1].id : null,
        nextId: index < sortedImages.length - 1 ? sortedImages[index + 1].id : null,
      }
    },
    [sortedImages]
  )

  const createTaggingState = useCallback(
    (imageId: string, imageUrl: string): TaggingImageState | null => {
      const image = images.find((img) => img.id === imageId)
      if (!image) return null

      const neighbors = findNeighbors(imageId)

      return {
        id: imageId,
        url: imageUrl,
        originalFilename: image.original_filename || "",
        hasBeenProcessed: image.has_been_processed || false,
        prevId: neighbors.prevId,
        nextId: neighbors.nextId,
      }
    },
    [images, findNeighbors]
  )

  const navigateToPrevious = useCallback(
    (current: TaggingImageState | null): TaggingImageState | null => {
      if (!current?.prevId) return null

      const prevImage = images.find((img) => img.id === current.prevId)
      if (!prevImage) return null

      const neighbors = findNeighbors(prevImage.id)

      return {
        id: prevImage.id,
        url: prevImage.image_url,
        originalFilename: prevImage.original_filename || "",
        hasBeenProcessed: prevImage.has_been_processed || false,
        prevId: neighbors.prevId,
        nextId: neighbors.nextId,
      }
    },
    [images, findNeighbors]
  )

  const navigateToNext = useCallback(
    (current: TaggingImageState | null): TaggingImageState | null => {
      if (!current?.nextId) return null

      const nextImage = images.find((img) => img.id === current.nextId)
      if (!nextImage) return null

      const neighbors = findNeighbors(nextImage.id)

      return {
        id: nextImage.id,
        url: nextImage.image_url,
        originalFilename: nextImage.original_filename || "",
        hasBeenProcessed: nextImage.has_been_processed || false,
        prevId: neighbors.prevId,
        nextId: neighbors.nextId,
      }
    },
    [images, findNeighbors]
  )

  return {
    sortedImages,
    hiddenCount,
    findNeighbors,
    createTaggingState,
    navigateToPrevious,
    navigateToNext,
  }
}
