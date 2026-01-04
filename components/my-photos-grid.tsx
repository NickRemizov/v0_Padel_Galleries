"use client"

import { useState } from "react"
import Link from "next/link"
import Masonry from "react-masonry-css"
import { Check, X, EyeOff } from "lucide-react"

interface PhotoFace {
  id: string
  photo_id: string
  person_id: string
  recognition_confidence: number | null
  verified: boolean
  hidden_by_user: boolean
  insightface_bbox: any
  gallery_images?: {
    id: string
    slug?: string
    gallery_id: string
    image_url: string
    original_url: string
    galleries?: {
      id: string
      slug?: string
      title: string
    }
  }
}

interface MyPhotosGridProps {
  photoFaces: PhotoFace[]
  personId: string
}

export function MyPhotosGrid({ photoFaces: initialPhotoFaces, personId }: MyPhotosGridProps) {
  const [photoFaces, setPhotoFaces] = useState(initialPhotoFaces)
  const [loading, setLoading] = useState<string | null>(null)

  const breakpointColumns = {
    default: 4,
    1536: 3,
    1024: 2,
    640: 1,
  }

  // Count faces on each photo
  const photoFaceCounts = photoFaces.reduce((acc, pf) => {
    acc[pf.photo_id] = (acc[pf.photo_id] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  async function handleVerify(photoFaceId: string) {
    setLoading(photoFaceId)
    try {
      const res = await fetch(`/api/my-photos/${photoFaceId}/verify`, { method: "POST" })
      if (res.ok) {
        setPhotoFaces(prev => prev.map(pf =>
          pf.id === photoFaceId ? { ...pf, verified: true } : pf
        ))
      }
    } catch (error) {
      console.error("Error verifying:", error)
    } finally {
      setLoading(null)
    }
  }

  async function handleReject(photoFaceId: string) {
    if (!confirm("Это точно не вы на фото? Связь с этим фото будет удалена.")) {
      return
    }
    setLoading(photoFaceId)
    try {
      const res = await fetch(`/api/my-photos/${photoFaceId}/reject`, { method: "POST" })
      if (res.ok) {
        setPhotoFaces(prev => prev.filter(pf => pf.id !== photoFaceId))
      }
    } catch (error) {
      console.error("Error rejecting:", error)
    } finally {
      setLoading(null)
    }
  }

  async function handleHide(photoFaceId: string) {
    if (!confirm("Скрыть это фото из общего просмотра?")) {
      return
    }
    setLoading(photoFaceId)
    try {
      const res = await fetch(`/api/my-photos/${photoFaceId}/hide`, { method: "POST" })
      if (res.ok) {
        setPhotoFaces(prev => prev.map(pf =>
          pf.id === photoFaceId ? { ...pf, hidden_by_user: true } : pf
        ))
      }
    } catch (error) {
      console.error("Error hiding:", error)
    } finally {
      setLoading(null)
    }
  }

  return (
    <Masonry
      breakpointCols={breakpointColumns}
      className="flex -ml-4 w-auto"
      columnClassName="pl-4 bg-clip-padding"
    >
      {photoFaces.map((photoFace) => {
        const image = photoFace.gallery_images
        if (!image) return null

        const gallerySlug = image.galleries?.slug || image.gallery_id
        const photoSlug = image.slug || image.id
        const confidence = photoFace.recognition_confidence
        const isOnlyPersonOnPhoto = photoFaceCounts[photoFace.photo_id] === 1
        const isLoading = loading === photoFace.id

        return (
          <div
            key={photoFace.id}
            className={`relative mb-4 group overflow-hidden rounded-lg ${
              photoFace.hidden_by_user ? "opacity-50" : ""
            }`}
          >
            {/* Photo link */}
            <Link href={`/gallery/${gallerySlug}?photo=${photoSlug}`}>
              <img
                src={image.image_url || "/placeholder.svg"}
                alt={image.galleries?.title || "Photo"}
                className="w-full h-auto transition-transform duration-300 group-hover:scale-105"
              />
            </Link>

            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors pointer-events-none" />

            {/* Confidence badge (bottom-left) - always visible if not verified */}
            {!photoFace.verified && confidence !== null && (
              <div className="absolute bottom-2 left-2 flex items-center gap-1">
                <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-md font-medium">
                  {Math.round(confidence * 100)}%
                </span>
                {/* Verify button on hover */}
                <button
                  onClick={(e) => { e.preventDefault(); handleVerify(photoFace.id) }}
                  disabled={isLoading}
                  className="opacity-0 group-hover:opacity-100 transition-opacity bg-green-500 hover:bg-green-600 text-white p-1.5 rounded-md disabled:opacity-50"
                  title="Подтвердить - это я"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Verified badge */}
            {photoFace.verified && (
              <div className="absolute bottom-2 left-2">
                <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-md font-medium flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Подтверждено
                </span>
              </div>
            )}

            {/* Hidden badge */}
            {photoFace.hidden_by_user && (
              <div className="absolute top-2 left-2">
                <span className="bg-gray-500 text-white text-xs px-2 py-1 rounded-md font-medium flex items-center gap-1">
                  <EyeOff className="w-3 h-3" />
                  Скрыто
                </span>
              </div>
            )}

            {/* Reject button (top-right) - always available on hover */}
            <button
              onClick={(e) => { e.preventDefault(); handleReject(photoFace.id) }}
              disabled={isLoading}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-md disabled:opacity-50"
              title="Это не я"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Hide button (bottom-right) - only if single person on photo and not hidden */}
            {isOnlyPersonOnPhoto && !photoFace.hidden_by_user && (
              <button
                onClick={(e) => { e.preventDefault(); handleHide(photoFace.id) }}
                disabled={isLoading}
                className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-600 hover:bg-gray-700 text-white p-1.5 rounded-md disabled:opacity-50"
                title="Скрыть из общего просмотра"
              >
                <EyeOff className="w-4 h-4" />
              </button>
            )}

            {/* Loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )
      })}
    </Masonry>
  )
}
