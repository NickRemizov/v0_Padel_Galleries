"use client"

import { Badge } from "@/components/ui/badge"
import type { TaggedFace } from "@/lib/types"
import { getFaceColor, getConfidenceDisplay } from "../utils"

interface FaceBadgesStripProps {
  taggedFaces: TaggedFace[]
  selectedFaceIndex: number | null
  onFaceClick: (index: number) => void
}

export function FaceBadgesStrip({
  taggedFaces,
  selectedFaceIndex,
  onFaceClick,
}: FaceBadgesStripProps) {
  const facesWithNames = taggedFaces.filter((face) => face.personName)

  if (facesWithNames.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap gap-2">
      {taggedFaces.map((taggedFace, index) => {
        if (!taggedFace.personName) return null

        const faceColor = getFaceColor(index)
        const isSelected = index === selectedFaceIndex
        const confidenceText = getConfidenceDisplay(taggedFace)
        const bgColor = taggedFace.verified ? "#22c55e" : faceColor

        return (
          <Badge
            key={index}
            style={{ backgroundColor: bgColor, color: "#ffffff" }}
            className={`text-sm px-3 py-1.5 cursor-pointer transition-all ${
              isSelected
                ? "ring-2 ring-offset-2 ring-blue-500 scale-110"
                : "hover:scale-105"
            }`}
            onClick={() => onFaceClick(index)}
          >
            {taggedFace.personName}{confidenceText}
          </Badge>
        )
      })}
    </div>
  )
}
