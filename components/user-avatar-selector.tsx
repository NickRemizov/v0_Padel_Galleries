"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { Loader2, ZoomIn } from "lucide-react"
import Cropper from "react-easy-crop"
import type { Area } from "react-easy-crop"

interface UserAvatarSelectorProps {
  imageUrl: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onAvatarUpdated?: () => void
}

export function UserAvatarSelector({
  imageUrl,
  open,
  onOpenChange,
  onAvatarUpdated,
}: UserAvatarSelectorProps) {
  const [loading, setLoading] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  async function getCroppedImg(imageSrc: string, pixelCrop: Area): Promise<Blob | null> {
    const image = new Image()
    image.crossOrigin = "anonymous"

    return new Promise((resolve, reject) => {
      image.onload = () => {
        const canvas = document.createElement("canvas")
        const ctx = canvas.getContext("2d")

        if (!ctx) {
          reject(new Error("Could not get canvas context"))
          return
        }

        // Avatar size: 420x560 (3:4 ratio)
        canvas.width = 420
        canvas.height = 560

        ctx.drawImage(
          image,
          pixelCrop.x,
          pixelCrop.y,
          pixelCrop.width,
          pixelCrop.height,
          0,
          0,
          420,
          560
        )

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error("Failed to create blob"))
            }
          },
          "image/jpeg",
          0.9
        )
      }

      image.onerror = () => {
        reject(new Error("Failed to load image"))
      }

      image.src = imageSrc
    })
  }

  async function handleSave() {
    if (!croppedAreaPixels) return

    try {
      setLoading(true)

      const blob = await getCroppedImg(imageUrl, croppedAreaPixels)
      if (!blob) {
        throw new Error("Failed to create cropped image")
      }

      const formData = new FormData()
      formData.append("file", blob, "avatar.jpg")

      const response = await fetch("/api/user/avatar", {
        method: "POST",
        body: formData,
        credentials: "include",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Upload failed")
      }

      // Reset state
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)

      onAvatarUpdated?.()
      onOpenChange(false)
    } catch (error) {
      console.error("Error uploading avatar:", error)
      alert("Ошибка при загрузке аватара. Попробуйте еще раз.")
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Создать аватар</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground mb-4">
            Выберите область для аватара. Перетащите и масштабируйте изображение.
          </p>

          <div className="relative mx-auto h-[400px] w-full bg-muted rounded-lg overflow-hidden">
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={3 / 4}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              objectFit="contain"
            />
          </div>

          <div className="mx-auto mt-6 flex max-w-md items-center gap-4">
            <ZoomIn className="h-5 w-5 text-muted-foreground" />
            <Slider
              value={[zoom]}
              onValueChange={(value) => setZoom(value[0])}
              min={1}
              max={3}
              step={0.1}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground">{Math.round(zoom * 100)}%</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={loading || !croppedAreaPixels}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Сохранение...
              </>
            ) : (
              "Сохранить аватар"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
