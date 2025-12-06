"use client"

import type React from "react"

import { useState, useRef } from "react"
import { addGalleryImagesAction } from "@/app/admin/actions"

interface GalleryImageUploaderProps {
  galleryId: string
  onUploadComplete: () => void
}

export function GalleryImageUploader({ galleryId, onUploadComplete }: GalleryImageUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (dragCounter.current === 1) {
      setIsDragging(true)
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current = 0
    setIsDragging(false)

    const files = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith("image/"))

    if (files.length === 0) return

    await processFiles(files)
  }

  async function processFiles(files: File[]) {
    setUploading(true)
    setUploadProgress(`Загрузка 0 из ${files.length}...`)

    const uploadResults = {
      success: [] as File[],
      failed: [] as { file: File; error: string }[],
    }

    try {
      const uploadedImages: {
        imageUrl: string
        originalUrl: string
        originalFilename: string
        fileSize: number
        width: number
        height: number
      }[] = []

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setUploadProgress(`Загрузка ${i + 1} из ${files.length}...`)

        try {
          const dimensions = await getImageDimensions(file)

          const formData = new FormData()
          formData.append("file", file)

          const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))

            if (errorData.code === "QUOTA_EXCEEDED") {
              throw new Error(errorData.error || "Квота хранилища исчерпана")
            }

            throw new Error(errorData.error || `Ошибка загрузки ${file.name}`)
          }

          const data = await response.json()
          uploadedImages.push({
            imageUrl: data.url,
            originalUrl: data.url,
            originalFilename: file.name,
            fileSize: file.size,
            width: dimensions.width,
            height: dimensions.height,
          })

          uploadResults.success.push(file)
        } catch (uploadError) {
          const errorMessage = uploadError instanceof Error ? uploadError.message : "Неизвестная ошибка"
          console.error(`[v0.9.0] Failed to upload ${file.name}:`, errorMessage)
          uploadResults.failed.push({ file, error: errorMessage })
        }
      }

      if (uploadResults.failed.length > 0) {
        const failedNames = uploadResults.failed.map((f) => f.file.name).join(", ")
        alert(
          `Загружено: ${uploadResults.success.length} из ${files.length}\nОшибки: ${failedNames.substring(0, 200)}${failedNames.length > 200 ? "..." : ""}`,
        )
      }

      if (uploadedImages.length > 0) {
        const result = await addGalleryImagesAction(galleryId, uploadedImages)

        if (result.success) {
          onUploadComplete()
          setUploadProgress("")
        } else {
          alert("Ошибка при сохранении изображений")
        }
      } else if (uploadResults.failed.length === files.length) {
        alert("Не удалось загрузить ни одного файла")
      }
    } catch (error) {
      console.error("[v0.9.0] Error uploading images:", error)
      const errorMessage = error instanceof Error ? error.message : "Ошибка загрузки изображений"
      alert(errorMessage)
    } finally {
      setUploading(false)
      setUploadProgress("")
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    await processFiles(Array.from(files))
    e.target.value = ""
  }

  function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => {
        resolve({ width: img.width, height: img.height })
      }
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }

  return {
    uploading,
    uploadProgress,
    isDragging,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleImageUpload,
  }
}
