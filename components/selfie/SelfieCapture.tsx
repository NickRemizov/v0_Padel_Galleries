"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Camera, RotateCcw, Check, X } from "lucide-react"

interface SelfieCaptureProps {
  onCapture: (imageBase64: string) => void
  onCancel: () => void
  isProcessing?: boolean
}

export function SelfieCapture({ onCapture, onCancel, isProcessing }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [hasCamera, setHasCamera] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user")

  const startCamera = useCallback(async () => {
    try {
      // Stop existing stream if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraError(null)
      setHasCamera(true)
    } catch (err) {
      console.error("Camera error:", err)
      setHasCamera(false)
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          setCameraError("Доступ к камере запрещён. Разрешите доступ в настройках браузера.")
        } else if (err.name === "NotFoundError") {
          setCameraError("Камера не найдена на устройстве.")
        } else {
          setCameraError(`Ошибка камеры: ${err.message}`)
        }
      }
    }
  }, [facingMode])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => {
      stopCamera()
    }
  }, [startCamera, stopCamera])

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")

    if (!ctx) return

    // Set canvas size to video size
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    // Draw video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Get base64 image
    const imageBase64 = canvas.toDataURL("image/jpeg", 0.9)
    setCapturedImage(imageBase64)

    // Stop camera
    stopCamera()
  }

  const handleRetake = () => {
    setCapturedImage(null)
    startCamera()
  }

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage)
    }
  }

  const handleSwitchCamera = () => {
    setFacingMode(prev => prev === "user" ? "environment" : "user")
    setCapturedImage(null)
  }

  if (cameraError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Camera className="w-16 h-16 text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">{cameraError}</p>
        <Button variant="outline" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-md aspect-[3/4] bg-black rounded-lg overflow-hidden">
        {capturedImage ? (
          <img
            src={capturedImage}
            alt="Captured selfie"
            className="w-full h-full object-cover"
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }}
          />
        )}

        {/* Overlay guide */}
        {!capturedImage && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-64 border-2 border-white/50 rounded-full" />
          </div>
        )}
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Controls */}
      <div className="flex gap-4 mt-6">
        {capturedImage ? (
          <>
            <Button
              variant="outline"
              size="lg"
              onClick={handleRetake}
              disabled={isProcessing}
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              Переснять
            </Button>
            <Button
              size="lg"
              onClick={handleConfirm}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Поиск...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5 mr-2" />
                  Подтвердить
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              size="lg"
              onClick={onCancel}
            >
              <X className="w-5 h-5 mr-2" />
              Отмена
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleSwitchCamera}
              className="rounded-full"
            >
              <RotateCcw className="w-5 h-5" />
            </Button>
            <Button
              size="lg"
              onClick={handleCapture}
              className="rounded-full w-16 h-16"
            >
              <Camera className="w-8 h-8" />
            </Button>
          </>
        )}
      </div>

      <p className="text-sm text-muted-foreground mt-4 text-center">
        Расположите лицо в центре кадра для лучшего распознавания
      </p>
    </div>
  )
}
