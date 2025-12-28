"use client"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { X, Star } from "lucide-react"
import FaceCropPreview from "@/components/FaceCropPreview"
import type { ClusterFace } from "../types"
import { formatDate, buildFaceTooltip } from "../utils"

interface ClusterFaceCardProps {
  face: ClusterFace
  index: number
  onRemove: (faceId: string) => void
}

export function ClusterFaceCard({ face, index, onRemove }: ClusterFaceCardProps) {
  const isFirst = index === 0
  const tooltip = buildFaceTooltip(face)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative aspect-square">
          <div className="w-full h-full rounded-lg overflow-hidden border">
            <FaceCropPreview imageUrl={face.image_url || "/placeholder.svg"} bbox={face.bbox} />
          </div>
          
          {isFirst && (
            <Star className="absolute top-2 left-2 h-5 w-5 fill-yellow-400 text-yellow-400" />
          )}
          
          <Button
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7"
            onClick={() => onRemove(face.id)}
            title="Убрать из кластера"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="whitespace-pre-line">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}
