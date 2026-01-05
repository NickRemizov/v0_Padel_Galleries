"use client"

import { useState, useCallback } from "react"
import type { GalleryImage, TaggedFace } from "@/lib/types"
import type { FaceData, PhotoRecognitionStats } from "../types"
import {
  getGalleryImagesAction,
  getGalleryFaceRecognitionStatsAction,
  getBatchPhotoFacesAction,
} from "@/app/admin/actions"

interface UseGalleryDataReturn {
  images: GalleryImage[]
  setImages: React.Dispatch<React.SetStateAction<GalleryImage[]>>
  photoFacesMap: Record<string, FaceData[]>
  photoFacesLoaded: boolean
  recognitionStats: Record<string, PhotoRecognitionStats>
  loading: boolean
  loadAllData: () => Promise<void>
  loadImages: () => Promise<void>
  loadRecognitionStats: () => Promise<void>
  loadPhotoFaces: () => Promise<void>
  updatePhotoFacesCache: (imageId: string, faces: TaggedFace[]) => void
  removeImages: (imageIds: string[]) => void
  hasVerifiedFaces: (imageId: string) => boolean
}

export function useGalleryData(galleryId: string): UseGalleryDataReturn {
  const [images, setImages] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(false)
  const [photoFacesMap, setPhotoFacesMap] = useState<Record<string, FaceData[]>>({})
  const [photoFacesLoaded, setPhotoFacesLoaded] = useState(false)
  const [recognitionStats, setRecognitionStats] = useState<Record<string, PhotoRecognitionStats>>({})

  const loadPhotoFacesForIds = useCallback(async (photoIds: string[]) => {
    const result = await getBatchPhotoFacesAction(photoIds)

    if (result.success && result.data) {
      const facesMap: Record<string, FaceData[]> = {}

      for (const face of result.data) {
        if (!facesMap[face.photo_id]) {
          facesMap[face.photo_id] = []
        }
        facesMap[face.photo_id].push({
          verified: face.verified,
          confidence: face.recognition_confidence || 0,
          person_id: face.person_id || null,
          bbox: face.insightface_bbox || null,
          hidden_by_user: face.hidden_by_user || false,
        })
      }

      setPhotoFacesMap(facesMap)
      setPhotoFacesLoaded(true)
    } else {
      setPhotoFacesLoaded(true)
    }
  }, [])

  const loadImages = useCallback(async () => {
    setLoading(true)
    const result = await getGalleryImagesAction(galleryId)
    if (result.success && result.data) {
      setImages(result.data)
    } else if (result.error) {
      console.error("[useGalleryData] Error loading images:", result.error)
    }
    setLoading(false)
  }, [galleryId])

  const loadRecognitionStats = useCallback(async () => {
    const result = await getGalleryFaceRecognitionStatsAction(galleryId)
    if (result.success && result.data) {
      setRecognitionStats(result.data)
    }
  }, [galleryId])

  const loadPhotoFaces = useCallback(async () => {
    const photoIds = images.map((img) => img.id)
    if (photoIds.length > 0) {
      await loadPhotoFacesForIds(photoIds)
    }
  }, [images, loadPhotoFacesForIds])

  // PARALLEL loading of images and faces for faster initial display
  const loadAllData = useCallback(async () => {
    setLoading(true)
    setPhotoFacesLoaded(false)

    // Start all requests in parallel
    const imagesPromise = getGalleryImagesAction(galleryId)
    const statsPromise = getGalleryFaceRecognitionStatsAction(galleryId)

    // Wait for images first to show layout
    const imagesResult = await imagesPromise
    if (imagesResult.success && imagesResult.data) {
      setImages(imagesResult.data)
      setLoading(false) // Show layout immediately

      // Load faces in parallel (needs photo IDs)
      const photoIds = imagesResult.data.map((img: GalleryImage) => img.id)
      if (photoIds.length > 0) {
        await loadPhotoFacesForIds(photoIds)
      } else {
        setPhotoFacesLoaded(true)
      }
    } else {
      console.error("[useGalleryData] Error loading images:", imagesResult.error)
      setPhotoFacesLoaded(true)
      setLoading(false)
    }

    // Stats can load in parallel (already started)
    const statsResult = await statsPromise
    if (statsResult.success && statsResult.data) {
      setRecognitionStats(statsResult.data)
    }
  }, [galleryId, loadPhotoFacesForIds])

  // Update local cache for a single photo - NO server reload!
  const updatePhotoFacesCache = useCallback((imageId: string, faces: TaggedFace[]) => {
    console.log(`[useGalleryData] Updating cache for ${imageId} with ${faces.length} faces`)

    setPhotoFacesMap((prev) => ({
      ...prev,
      [imageId]: faces.map((face) => ({
        verified: face.verified || false,
        confidence: face.recognitionConfidence || 1,
        person_id: face.personId || null,
        bbox: face.face.boundingBox || null,
        hidden_by_user: false,
      })),
    }))

    // Also update recognition stats for this photo
    setRecognitionStats((prev) => ({
      ...prev,
      [imageId]: {
        total: faces.length,
        recognized: faces.filter((f) => f.personId).length,
        fullyRecognized: faces.length > 0 && faces.every((f) => f.verified),
      },
    }))

    // Mark photo as processed in images array
    setImages((prev) =>
      prev.map((img) => (img.id === imageId ? { ...img, has_been_processed: true } : img))
    )
  }, [])

  // Remove images from local state - NO server reload!
  const removeImages = useCallback((imageIds: string[]) => {
    const idsSet = new Set(imageIds)
    
    // Remove from images array
    setImages((prev) => prev.filter((img) => !idsSet.has(img.id)))
    
    // Clean up photoFacesMap
    setPhotoFacesMap((prev) => {
      const next = { ...prev }
      for (const id of imageIds) {
        delete next[id]
      }
      return next
    })
    
    // Clean up recognitionStats
    setRecognitionStats((prev) => {
      const next = { ...prev }
      for (const id of imageIds) {
        delete next[id]
      }
      return next
    })
  }, [])

  const hasVerifiedFaces = useCallback(
    (imageId: string): boolean => {
      const faces = photoFacesMap[imageId]
      if (!faces || faces.length === 0) return false
      return faces.every((face) => face.verified === true)
    },
    [photoFacesMap]
  )

  return {
    images,
    setImages,
    photoFacesMap,
    photoFacesLoaded,
    recognitionStats,
    loading,
    loadAllData,
    loadImages,
    loadRecognitionStats,
    loadPhotoFaces,
    updatePhotoFacesCache,
    removeImages,
    hasVerifiedFaces,
  }
}
