"use client"

import React, { useMemo } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Check, X, UserPlus, EyeOff } from "lucide-react"
import type { PersonPhoto } from "../types"
import { calculateFaceStyles, formatShortDate } from "../utils"

interface PersonGalleryPhotoCardProps {
  photo: PersonPhoto
  isSelected: boolean
  onSelect: (photoId: string) => void
  onOpenTagging: (photoId: string, imageUrl: string) => void
  onDelete: (photoId: string) => void
  onVerify: (photoId: string) => void
  onOpenAvatarSelector: (photoId: string) => void
}

/**
 * Single photo card with React.memo for performance
 * Only re-renders when its specific props change
 */
export const PersonGalleryPhotoCard = React.memo(function PersonGalleryPhotoCard({
  photo,
  isSelected,
  onSelect,
  onOpenTagging,
  onDelete,
  onVerify,
  onOpenAvatarSelector,
}: PersonGalleryPhotoCardProps) {
  const canVerify = !photo.verified
  const isExcluded = photo.excluded_from_index === true
  const isHidden = photo.hidden_by_user === true

  // Memoize face styles calculation - only recalculate if bbox/dimensions change
  const faceStyles = useMemo(() => {
    return calculateFaceStyles(photo.boundingBox, photo.width, photo.height)
  }, [photo.boundingBox, photo.width, photo.height])

  return (
    <div className="group relative overflow-hidden rounded-lg border">
      <div
        className="relative aspect-square cursor-pointer overflow-hidden"
        onClick={() => onOpenTagging(photo.id, photo.image_url)}
      >
        {faceStyles ? (
          <div
            className="w-full h-full"
            style={{
              backgroundImage: `url(${photo.image_url || "/placeholder.svg"})`,
              backgroundSize: faceStyles.backgroundSize,
              backgroundPosition: faceStyles.backgroundPosition,
              backgroundRepeat: "no-repeat",
            }}
          />
        ) : (
          <Image
            src={photo.image_url || "/placeholder.svg"}
            alt="Photo"
            fill
            style={{ objectFit: "cover" }}
            sizes="250px"
          />
        )}

        {/* Selection checkbox */}
        <div
          className="absolute left-2 top-2 z-20"
          onClick={(e) => {
            e.stopPropagation()
            onSelect(photo.id)
          }}
        >
          <Checkbox
            checked={isSelected}
            className="bg-white border-2 border-gray-400 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
          />
        </div>

        {/* Verification badge */}
        {photo.verified ? (
          <div className="absolute left-2 bottom-2 z-10 bg-green-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm shadow-lg">
            ✓
          </div>
        ) : (
          <div
            className={`absolute left-2 bottom-2 z-10 bg-blue-500 text-white rounded-md px-2 py-1 text-xs font-semibold shadow-lg transition-opacity ${canVerify ? "group-hover:opacity-0" : ""}`}
          >
            {Math.round((photo.confidence || 0) * 100)}%
          </div>
        )}

        {/* Hover overlay with actions */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <Button
            variant="destructive"
            size="icon"
            className="absolute right-2 top-2 pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(photo.id)
            }}
          >
            <X className="h-4 w-4" />
          </Button>

          {canVerify && (
            <Button
              variant="secondary"
              size="icon"
              className="absolute left-2 bottom-2 pointer-events-auto bg-green-500 hover:bg-green-600 text-white opacity-0 group-hover:opacity-100 transition-opacity z-20"
              onClick={(e) => {
                e.stopPropagation()
                onVerify(photo.id)
              }}
            >
              <Check className="h-4 w-4" />
            </Button>
          )}

          <Button
            variant="secondary"
            size="icon"
            className="absolute right-2 bottom-2 pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation()
              onOpenAvatarSelector(photo.id)
            }}
          >
            <UserPlus className="h-4 w-4" />
          </Button>
        </div>

        {/* Hidden by user indicator - bottom center */}
        {isHidden && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white rounded px-2 py-1 flex items-center gap-1 shadow-lg z-10">
            <EyeOff className="h-3 w-3" />
          </div>
        )}
      </div>

      {/* Photo info */}
      <div className={`p-2 space-y-0.5 ${isExcluded ? "bg-gray-200" : ""}`}>
        <p className="text-xs font-medium truncate" title={photo.filename}>
          {photo.filename}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {photo.gallery_name || "Неизвестная галерея"}{" "}
          {photo.shootDate ? formatShortDate(photo.shootDate) : ""}
        </p>
      </div>
    </div>
  )
})
