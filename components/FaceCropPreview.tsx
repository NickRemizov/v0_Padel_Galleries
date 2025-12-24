"use client"

import { useEffect, useRef } from "react"

interface FaceCropPreviewProps {
  imageUrl: string
  bbox: {
    x: number
    y: number
    width: number
    height: number
  }
  size?: number
}

export default function FaceCropPreview({ imageUrl, bbox, size = 200 }: FaceCropPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = "anonymous"

    img.onload = () => {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"

      // 50% padding on each side for height
      const padding = 0.5
      const paddedHeight = bbox.height * (1 + padding * 2)
      
      // Make width equal to height for square crop
      const paddedWidth = paddedHeight
      
      // Center horizontally based on bbox center
      const bboxCenterX = bbox.x + bbox.width / 2
      const paddedX = bboxCenterX - paddedWidth / 2
      const paddedY = Math.max(0, bbox.y - bbox.height * padding)

      const cropX = Math.max(0, paddedX)
      const cropY = Math.max(0, paddedY)
      const cropWidth = Math.min(paddedWidth, img.width - cropX)
      const cropHeight = Math.min(paddedHeight, img.height - cropY)

      // Ensure square output
      const cropSize = Math.min(cropWidth, cropHeight)

      const previewSize = size
      canvas.width = previewSize
      canvas.height = previewSize

      // Draw the crop centered
      ctx.drawImage(
        img, 
        cropX, cropY, cropSize, cropSize, 
        0, 0, previewSize, previewSize
      )
    }

    img.onerror = () => {
      console.error("[FaceCropPreview] Failed to load image:", imageUrl)
    }

    img.src = imageUrl
  }, [imageUrl, bbox, size])

  return <canvas ref={canvasRef} className="w-full h-full rounded-lg border-2 border-primary" />
}
