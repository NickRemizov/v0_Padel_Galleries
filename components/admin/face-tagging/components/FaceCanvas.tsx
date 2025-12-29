"use client"

import type React from "react"
import { Loader2 } from "lucide-react"
import type { TaggedFace } from "@/lib/types"
import type { ImageFitMode } from "../types"
import { getRenderedImageDimensions } from "../utils"

interface FaceCanvasProps {
  imageUrl: string
  isLoading: boolean
  isLandscape: boolean
  imageFitMode: ImageFitMode
  taggedFaces: TaggedFace[]
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  imageRef: React.RefObject<HTMLImageElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  onImageLoad: () => void
  onFaceClick: (index: number) => void
}

export function FaceCanvas({
  imageUrl,
  isLoading,
  isLandscape,
  imageFitMode,
  taggedFaces,
  canvasRef,
  imageRef,
  containerRef,
  onImageLoad,
  onFaceClick,
}: FaceCanvasProps) {
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const { renderedWidth, renderedHeight, offsetX, offsetY } = getRenderedImageDimensions(canvas, imageFitMode)

    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    // Check if click is within image bounds
    if (
      clickX < offsetX ||
      clickX > offsetX + renderedWidth ||
      clickY < offsetY ||
      clickY > offsetY + renderedHeight
    ) {
      return
    }

    // Convert to image coordinates
    const imageX = ((clickX - offsetX) / renderedWidth) * canvas.width
    const imageY = ((clickY - offsetY) / renderedHeight) * canvas.height

    // Find clicked face
    const clickedIndex = taggedFaces.findIndex((taggedFace) => {
      const { boundingBox } = taggedFace.face
      if (!boundingBox) return false
      return (
        imageX >= boundingBox.x &&
        imageX <= boundingBox.x + boundingBox.width &&
        imageY >= boundingBox.y &&
        imageY <= boundingBox.y + boundingBox.height
      )
    })

    if (clickedIndex !== -1) {
      onFaceClick(clickedIndex)
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full border rounded-lg bg-black flex-1 min-h-0 overflow-auto"
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <span className="ml-2 text-white">Загрузка...</span>
        </div>
      )}

      <img
        ref={imageRef}
        src={imageUrl || "/placeholder.svg"}
        alt="Фото для тегирования"
        className="hidden"
        crossOrigin="anonymous"
        onLoad={onImageLoad}
      />

      <canvas
        ref={canvasRef}
        className={`cursor-pointer ${
          imageFitMode === "contain"
            ? "w-full h-full object-contain"
            : isLandscape
              ? "h-full w-auto"
              : "w-full h-auto"
        }`}
        onClick={handleCanvasClick}
      />
    </div>
  )
}
