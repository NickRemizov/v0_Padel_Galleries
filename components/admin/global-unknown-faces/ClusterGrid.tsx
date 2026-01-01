"use client"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { X, Star } from "lucide-react"
import FaceCropPreview from "@/components/FaceCropPreview"
import type { ClusterFace } from "./types"

interface ClusterGridProps {
  faces: ClusterFace[]
  minGridHeight: number | null
  onRemoveFace: (faceId: string) => void
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ""
  try {
    const date = new Date(dateStr)
    const day = date.getDate().toString().padStart(2, "0")
    const month = (date.getMonth() + 1).toString().padStart(2, "0")
    return `${day}.${month}`
  } catch {
    return ""
  }
}

function buildTooltip(face: ClusterFace): string {
  const lines: string[] = []
  if (face.gallery_title) {
    const dateStr = face.shoot_date ? ` ${formatDate(face.shoot_date)}` : ""
    lines.push(`Галерея: ${face.gallery_title}${dateStr}`)
  }
  if (face.original_filename) {
    lines.push(`Файл: ${face.original_filename}`)
  }
  if (face.distance_to_centroid !== undefined) {
    lines.push(`Расстояние до центроида: ${face.distance_to_centroid.toFixed(2)}`)
  }
  return lines.join("\n")
}

export function ClusterGrid({ faces, minGridHeight, onRemoveFace }: ClusterGridProps) {
  return (
    <div
      className="grid grid-cols-4 gap-4 content-start"
      style={{ minHeight: minGridHeight ? `${minGridHeight}px` : undefined }}
    >
      <TooltipProvider>
        {faces.map((face, index) => (
          <Tooltip key={face.id}>
            <TooltipTrigger asChild>
              <div className="relative aspect-square">
                <div className="w-full h-full rounded-lg overflow-hidden border">
                  <FaceCropPreview
                    imageUrl={face.image_url || "/placeholder.svg"}
                    bbox={face.bbox}
                  />
                </div>
                {index === 0 && (
                  <Star className="absolute top-2 left-2 h-5 w-5 fill-yellow-400 text-yellow-400" />
                )}
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7"
                  onClick={() => onRemoveFace(face.id)}
                  title="Убрать из кластера"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="whitespace-pre-line">
              {buildTooltip(face)}
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>
    </div>
  )
}
