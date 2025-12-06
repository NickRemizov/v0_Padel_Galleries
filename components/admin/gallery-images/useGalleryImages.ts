"use client"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import type { GalleryImage } from "@/lib/types"
import { getGalleryFaceRecognitionStatsAction, getBatchPhotoFacesAction } from "@/app/admin/actions"

export type SortOption = "filename" | "created" | "added"

export function useGalleryImages(galleryId: string, open: boolean) {
  const [images, setImages] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(false)
  const [sortBy, setSortBy] = useState<SortOption>("filename")
  const [recognitionStats, setRecognitionStats] = useState<
    Record<string, { total: number; recognized: number; fullyRecognized: boolean }>
  >({})
  const [photoFacesMap, setPhotoFacesMap] = useState<
    Record<string, { verified: boolean; confidence: number; person_id: string | null }[]>
  >({})

  useEffect(() => {
    if (open) {
      loadImages()
      loadRecognitionStats()
    }
  }, [open, galleryId])

  useEffect(() => {
    if (images.length > 0) {
      loadPhotoFaces()
    }
  }, [images])

  async function loadImages() {
    setLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from("gallery_images")
      .select(
        "id, image_url, original_url, original_filename, file_size, width, height, display_order, gallery_id, created_at, download_count, has_been_processed",
      )
      .eq("gallery_id", galleryId)
      .order("display_order", { ascending: true })

    if (!error && data) {
      setImages(data)
    } else if (error) {
      console.error("[v0] Error loading images:", error)
    }
    setLoading(false)
  }

  async function loadRecognitionStats() {
    const result = await getGalleryFaceRecognitionStatsAction(galleryId)
    if (result.success && result.data) {
      setRecognitionStats(result.data)
    }
  }

  async function loadPhotoFaces() {
    console.log("[v0] [useGalleryImages] loadPhotoFaces START")
    console.log("[v0] [useGalleryImages] images count:", images.length)

    const photoIds = images.map((img) => img.id)

    console.log("[v0] [useGalleryImages] Calling getBatchPhotoFacesAction with photoIds:", photoIds)

    const result = await getBatchPhotoFacesAction(photoIds)

    console.log("[v0] [useGalleryImages] getBatchPhotoFacesAction result:", {
      success: result.success,
      successType: typeof result.success,
      dataLength: result.data?.length,
      error: result.error,
      fullResult: result,
    })

    if (result.success && result.data) {
      const facesMap: Record<string, { verified: boolean; confidence: number; person_id: string | null }[]> = {}

      for (const face of result.data) {
        console.log("[v0] [useGalleryImages] Face from DB:", {
          photo_id: face.photo_id,
          person_id: face.person_id,
          recognition_confidence: face.recognition_confidence,
          verified: face.verified,
        })

        if (!facesMap[face.photo_id]) {
          facesMap[face.photo_id] = []
        }
        facesMap[face.photo_id].push({
          verified: face.verified,
          confidence: face.recognition_confidence || 0,
          person_id: face.person_id || null,
        })
      }

      console.log("[v0] [useGalleryImages] Loaded photo faces map:", {
        photosCount: Object.keys(facesMap).length,
        photoIds: Object.keys(facesMap),
      })

      setPhotoFacesMap(facesMap)
    } else {
      console.log("[v0] [useGalleryImages] No faces data or error:", {
        success: result.success,
        error: result.error,
        hasData: !!result.data,
      })
    }
  }

  const sortedImages = useMemo(() => {
    const imagesCopy = [...images]

    switch (sortBy) {
      case "filename":
        return imagesCopy.sort((a, b) => (a.original_filename || "").localeCompare(b.original_filename || ""))
      case "created":
      case "added":
        return imagesCopy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      default:
        return imagesCopy
    }
  }, [images, sortBy])

  const allPhotosVerified = useMemo(() => {
    if (images.length === 0) return false

    return images.every((image) => {
      const stats = recognitionStats[image.id]
      const faces = photoFacesMap[image.id]
      const hasVerified = faces && faces.length > 0 && faces.every((face) => face.verified === true)
      return stats?.fullyRecognized || hasVerified
    })
  }, [images, recognitionStats, photoFacesMap])

  return {
    images,
    sortedImages,
    loading,
    sortBy,
    setSortBy,
    recognitionStats,
    photoFacesMap,
    allPhotosVerified,
    loadImages,
    loadRecognitionStats,
    loadPhotoFaces,
  }
}
