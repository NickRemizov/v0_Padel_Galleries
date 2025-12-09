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
      // 50% padding on each side
      const padding = 0.5
      const paddedWidth = bbox.width * (1 + padding * 2)
      const paddedHeight = bbox.height * (1 + padding * 2)
      const paddedX = Math.max(0, bbox.x - bbox.width * padding)
      const paddedY = Math.max(0, bbox.y - bbox.height * padding)

      const cropX = Math.max(0, paddedX)
      const cropY = Math.max(0, paddedY)
      const cropWidth = Math.min(paddedWidth, img.width - cropX)
      const cropHeight = Math.min(paddedHeight, img.height - cropY)

      const previewSize = size
      canvas.width = previewSize
      canvas.height = previewSize

      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, previewSize, previewSize)

      const scale = Math.min(previewSize / cropWidth, previewSize / cropHeight)
      const scaledWidth = cropWidth * scale
      const scaledHeight = cropHeight * scale

      const offsetX = (previewSize - scaledWidth) / 2
      const offsetY = (previewSize - scaledHeight) / 2

      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, offsetX, offsetY, scaledWidth, scaledHeight)
    }

    img.onerror = () => {
      console.error("[FaceCropPreview] Failed to load image:", imageUrl)
    }

    img.src = imageUrl
  }, [imageUrl, bbox, size])

  return <canvas ref={canvasRef} className="w-full h-full rounded-lg border-2 border-primary" />
}
