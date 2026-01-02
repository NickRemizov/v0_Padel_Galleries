"use client"

import { memo } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Trash2, Star, Download } from "lucide-react"

import type { GalleryImage } from "@/lib/types"
import type { FaceData, PhotoRecognitionStats } from "../types"
import { formatFileSize, calculateFacePosition } from "../utils/image-helpers"

interface GalleryImageCardProps {
  image: GalleryImage
  photoFacesMap: Record<string, FaceData[]>
  photoFacesLoaded: boolean
  recognitionStats: Record<string, PhotoRecognitionStats>
  onTag: (id: string, url: string) => void
  onDelete: (id: string) => void
  onToggleFeatured: (id: string, isFeatured: boolean) => void
  isSelected: boolean
  onToggleSelect: (id: string) => void
}

export const GalleryImageCard = memo(function GalleryImageCard({
  image,
  photoFacesMap,
  photoFacesLoaded,
  recognitionStats,
  onTag,
  onDelete,
  onToggleFeatured,
  isSelected,
  onToggleSelect,
}: GalleryImageCardProps) {
  const faces = photoFacesMap[image.id]
  const hasDetected = faces && faces.length > 0
  const hasVerified = faces && faces.length > 0 && faces.every((face) => face.verified === true)
  const hasUnknown = faces?.some((face) => face.person_id === null) || false
  const isFullyRecognized = recognitionStats[image.id]?.fullyRecognized || false
  const hasBeenProcessed = image.has_been_processed || false

  const nonVerifiedFaces = faces?.filter((face) => !face.verified && face.person_id !== null) || []
  const confidence =
    nonVerifiedFaces.length > 0
      ? Math.round(
          (nonVerifiedFaces.reduce((sum, face) => sum + (face.confidence || 0), 0) / nonVerifiedFaces.length) * 100,
        )
      : null

  const unknownCount = faces?.filter((f) => f.person_id === null).length || 0
  const recognizedCount = faces?.filter((f) => f.person_id !== null).length || 0
  const totalCount = faces?.length || 0

  // Calculate object position only when face data is loaded
  const bboxes = photoFacesLoaded
    ? (faces
        ?.map((f) => {
          if (!f.bbox) return null
          return [f.bbox.x, f.bbox.y, f.bbox.x + f.bbox.width, f.bbox.y + f.bbox.height]
        })
        .filter((b): b is number[] => b !== null) || [])
    : []

  const objectPosition = calculateFacePosition(image.width, image.height, bboxes)

  return (
    <div
      className="group relative overflow-hidden rounded-lg border cursor-pointer"
      onClick={() => onTag(image.id, image.image_url)}
    >
      <div className="relative aspect-square bg-muted">
        {/* Skeleton placeholder while face data loads */}
        {!photoFacesLoaded && <div className="absolute inset-0 bg-muted animate-pulse z-5" />}
        <Image
          src={image.image_url || "/placeholder.svg"}
          alt={image.original_filename}
          fill
          className={`object-cover transition-opacity duration-300 ${
            photoFacesLoaded ? "opacity-100" : "opacity-0"
          }`}
          sizes="250px"
          style={{ objectPosition }}
        />
        <div
          className="absolute left-2 top-2 z-20"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect(image.id)
          }}
        >
          <Checkbox
            checked={isSelected}
            className="bg-white border-2 border-gray-400 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
          />
        </div>
        {/* Hover overlay with delete button */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <Button
            variant="destructive"
            size="icon"
            className="absolute right-2 top-2 pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(image.id)
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {/* Star button - always visible when featured, otherwise on hover */}
        <Button
          variant="ghost"
          size="icon"
          className={`absolute right-2 bottom-2 pointer-events-auto transition-opacity ${
            image.is_featured
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          }`}
          onClick={(e) => {
            e.stopPropagation()
            onToggleFeatured(image.id, !image.is_featured)
          }}
        >
          <Star
            className={`h-5 w-5 ${
              image.is_featured
                ? "fill-yellow-400 text-yellow-400"
                : "text-white"
            }`}
          />
        </Button>
        {image.download_count > 0 && (
          <div className="absolute left-2 top-10 bg-black/70 text-white rounded px-2 py-1 text-xs flex items-center gap-1 shadow-lg z-10">
            <Download className="h-3 w-3" />
            {image.download_count}
          </div>
        )}
        {photoFacesLoaded && hasBeenProcessed && !hasDetected && (
          <div className="absolute left-2 bottom-2 bg-gray-500 text-white rounded px-2 py-1 text-xs font-semibold shadow-lg z-10">
            NFD
          </div>
        )}
        {photoFacesLoaded && hasDetected && hasUnknown && !isFullyRecognized && !hasVerified && (
          <div className="absolute left-2 bottom-2 bg-orange-500 text-white rounded px-2 py-1 text-xs font-semibold shadow-lg z-10">
            {unknownCount}/{recognizedCount}/{totalCount}
          </div>
        )}
        {photoFacesLoaded && confidence !== null && !hasUnknown && !hasVerified && (
          <div className="absolute left-2 bottom-2 bg-blue-500 text-white rounded px-2 py-1 text-xs font-semibold shadow-lg z-10">
            {confidence}%
          </div>
        )}
        {photoFacesLoaded && hasVerified && (
          <div className="absolute left-2 bottom-2 bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm shadow-lg z-10">
            ✓
          </div>
        )}
      </div>
      <div className="bg-background p-2 border-t">
        <p className="text-xs font-medium truncate" title={image.original_filename}>
          {image.original_filename}
        </p>
        <p className="text-xs text-muted-foreground">{formatFileSize(image.file_size)}</p>
      </div>
    </div>
  )
})
