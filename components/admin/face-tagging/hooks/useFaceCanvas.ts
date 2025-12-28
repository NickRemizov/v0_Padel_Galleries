"use client"

import { useRef, useCallback } from "react"
import type { TaggedFace } from "@/lib/types"
import { getFaceColor, getConfidenceDisplay } from "../utils"

/**
 * Hook for canvas drawing operations
 */
export function useFaceCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }, [])

  const drawFaces = useCallback((faces: TaggedFace[], selectedFaceIndex: number | null) => {
    const canvas = canvasRef.current
    const image = imageRef.current
    if (!canvas || !image || !image.complete) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0)

    faces.forEach((taggedFace, index) => {
      const { boundingBox } = taggedFace.face
      if (!boundingBox) return

      const isSelected = index === selectedFaceIndex
      const faceColor = getFaceColor(index)
      const borderColor = taggedFace.verified ? "#22c55e" : faceColor

      // Draw bounding box
      ctx.strokeStyle = isSelected ? "#3b82f6" : borderColor
      ctx.lineWidth = isSelected ? 8 : 4
      ctx.strokeRect(boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height)

      // Draw label if person is assigned
      if (taggedFace.personName) {
        const confidenceText = getConfidenceDisplay(taggedFace)
        const label = `${taggedFace.personName}${confidenceText}`

        ctx.font = "bold 20px sans-serif"
        const textWidth = ctx.measureText(label).width
        const padding = 10
        const labelHeight = 32
        const labelX = boundingBox.x
        const labelY = boundingBox.y - labelHeight - 5

        const bgColor = taggedFace.verified ? "#22c55e" : (isSelected ? "#3b82f6" : faceColor)
        ctx.fillStyle = bgColor
        ctx.fillRect(labelX, labelY, textWidth + padding * 2, labelHeight)

        ctx.fillStyle = "#ffffff"
        ctx.fillText(label, labelX + padding, labelY + labelHeight - 8)
      }
    })
  }, [])

  return {
    canvasRef,
    imageRef,
    clearCanvas,
    drawFaces,
  }
}
