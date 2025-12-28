"use client"

import { useState, useRef, useCallback } from "react"
import { addGalleryImagesAction } from "@/app/admin/actions"
import { getImageDimensions } from "../utils/image-helpers"

interface UseImageUploadReturn {
  uploading: boolean
  uploadProgress: string
  isDragging: boolean
  handleDragEnter: (e: React.DragEvent) => void
  handleDragLeave: (e: React.DragEvent) => void
  handleDragOver: (e: React.DragEvent) => void
  handleDrop: (e: React.DragEvent) => Promise<void>
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
}

interface UseImageUploadOptions {
  galleryId: string
  onUploadComplete: () => Promise<void>
}

export function useImageUpload({
  galleryId,
  onUploadComplete,
}: UseImageUploadOptions): UseImageUploadReturn {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)

  const processFiles = useCallback(
    async (files: File[]) => {
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
            const errorMessage =
              uploadError instanceof Error ? uploadError.message : "Неизвестная ошибка"
            console.error(`Failed to upload ${file.name}:`, errorMessage)
            uploadResults.failed.push({ file, error: errorMessage })
          }
        }

        if (uploadResults.failed.length > 0) {
          const failedNames = uploadResults.failed.map((f) => f.file.name).join(", ")
          alert(
            `Загружено: ${uploadResults.success.length} из ${files.length}\nОшибки: ${failedNames.substring(0, 200)}${failedNames.length > 200 ? "..." : ""}`
          )
        }

        if (uploadedImages.length > 0) {
          const result = await addGalleryImagesAction(galleryId, uploadedImages)
          if (result.success) {
            await onUploadComplete()
            setUploadProgress("")
          } else {
            alert("Ошибка при сохранении изображений")
          }
        } else if (uploadResults.failed.length === files.length) {
          alert("Не удалось загрузить ни одного файла")
        }
      } catch (error) {
        console.error("Error uploading images:", error)
        const errorMessage =
          error instanceof Error ? error.message : "Ошибка загрузки изображений"
        alert(errorMessage)
      } finally {
        setUploading(false)
        setUploadProgress("")
      }
    },
    [galleryId, onUploadComplete]
  )

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (dragCounter.current === 1) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragging(false)

      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("image/")
      )
      if (files.length === 0) return

      await processFiles(files)
    },
    [processFiles]
  )

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return

      await processFiles(Array.from(files))
      e.target.value = ""
    },
    [processFiles]
  )

  return {
    uploading,
    uploadProgress,
    isDragging,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleFileInputChange,
  }
}
