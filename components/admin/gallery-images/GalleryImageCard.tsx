"use client"

import { memo } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { UserPlus, Trash2, Download } from "lucide-react"
import type { GalleryImage } from "@/lib/types"

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "N/A"
  const kb = bytes / 1024
  return `${kb.toFixed(1)} KB`
}

export const GalleryImageCard = memo(function GalleryImageCard({
  image,
  photoFacesMap,
  recognitionStats,
  onTag,
  onDelete,
  isSelected,
  onToggleSelect,
}: {
  image: GalleryImage
  photoFacesMap: Record<string, { verified: boolean; confidence: number; person_id: string | null }[]>
  recognitionStats: Record<string, { total: number; recognized: number; fullyRecognized: boolean }>
  onTag: (id: string, url: string) => void
  onDelete: (id: string) => void
  isSelected: boolean
  onToggleSelect: (id: string) => void
}) {
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

  return (
    <div
      className="group relative overflow-hidden rounded-lg border cursor-pointer"
      onClick={() => onTag(image.id, image.image_url)}
    >
      <div className="relative aspect-square">
        <Image
          src={image.image_url || "/placeholder.svg"}
          alt={image.original_filename}
          fill
          className="object-cover"
          sizes="250px"
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
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <Button
            variant="secondary"
            size="icon"
            className="absolute right-2 bottom-2 pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation()
              onTag(image.id, image.image_url)
            }}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
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
        {image.download_count > 0 && (
          <div className="absolute left-2 top-10 bg-black/70 text-white rounded px-2 py-1 text-xs flex items-center gap-1 shadow-lg z-10">
            <Download className="h-3 w-3" />
            {image.download_count}
          </div>
        )}
        {hasBeenProcessed && !hasDetected && (
          <div className="absolute left-2 bottom-2 bg-gray-500 text-white rounded px-2 py-1 text-xs font-semibold shadow-lg z-10">
            NFD
          </div>
        )}
        {hasDetected && hasUnknown && !isFullyRecognized && !hasVerified && (
          <div className="absolute left-2 bottom-2 bg-orange-500 text-white rounded px-2 py-1 text-xs font-semibold shadow-lg z-10">
            {unknownCount}/{recognizedCount}/{totalCount}
          </div>
        )}
        {confidence !== null && !hasUnknown && !hasVerified && (
          <div className="absolute left-2 bottom-2 bg-blue-500 text-white rounded px-2 py-1 text-xs font-semibold shadow-lg z-10">
            {confidence}%
          </div>
        )}
        {hasVerified && (
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
