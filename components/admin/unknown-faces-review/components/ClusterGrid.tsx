"use client"

import { Button } from "@/components/ui/button"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ClusterFace } from "../types"
import { ClusterFaceCard } from "./ClusterFaceCard"

interface ClusterGridProps {
  faces: ClusterFace[]
  minHeight: number | null
  hasNextCluster: boolean
  onRemoveFace: (faceId: string) => void
  onNextCluster: () => void
}

export function ClusterGrid({
  faces,
  minHeight,
  hasNextCluster,
  onRemoveFace,
  onNextCluster,
}: ClusterGridProps) {
  if (faces.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <p>Все лица в кластере удалены</p>
        <Button
          variant="outline"
          className="mt-2"
          onClick={onNextCluster}
          disabled={!hasNextCluster}
        >
          Перейти к следующему кластеру
        </Button>
      </div>
    )
  }

  return (
    <div
      className="grid grid-cols-4 gap-4 content-start"
      style={{ minHeight: minHeight ? `${minHeight}px` : undefined }}
    >
      <TooltipProvider>
        {faces.map((face, index) => (
          <ClusterFaceCard
            key={face.id}
            face={face}
            index={index}
            onRemove={onRemoveFace}
          />
        ))}
      </TooltipProvider>
    </div>
  )
}
