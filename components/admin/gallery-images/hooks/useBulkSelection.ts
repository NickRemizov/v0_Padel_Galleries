"use client"

import { useState, useCallback } from "react"

interface UseBulkSelectionReturn {
  selectedPhotos: Set<string>
  togglePhotoSelection: (photoId: string) => void
  clearSelection: () => void
  hasSelection: boolean
  selectionCount: number
}

export function useBulkSelection(): UseBulkSelectionReturn {
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set())

  const togglePhotoSelection = useCallback((photoId: string) => {
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

  const clearSelection = useCallback(() => {
    setSelectedPhotos(new Set())
  }, [])

  return {
    selectedPhotos,
    togglePhotoSelection,
    clearSelection,
    hasSelection: selectedPhotos.size > 0,
    selectionCount: selectedPhotos.size,
  }
}
