"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SelfiePrompt } from "./SelfiePrompt"
import { SelfieCapture } from "./SelfieCapture"
import { SelfieResults } from "./SelfieResults"

type FlowStep = "prompt" | "capture" | "results" | "collision" | "success"

interface Match {
  photo_face_id: string
  photo_id: string
  image_url: string
  filename: string
  similarity: number
}

interface Collision {
  person_id: string
  similarity: number
  sample_photos: { image_url: string }[]
}

interface SelfieFlowProps {
  userId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SelfieFlow({ userId, open, onOpenChange }: SelfieFlowProps) {
  const router = useRouter()
  const [step, setStep] = useState<FlowStep>("prompt")
  const [isProcessing, setIsProcessing] = useState(false)
  const [matches, setMatches] = useState<Match[]>([])
  const [selfieSearchId, setSelfieSearchId] = useState<string | null>(null)
  const [collision, setCollision] = useState<Collision | null>(null)
  const [totalPhotos, setTotalPhotos] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleStartCapture = () => {
    setStep("capture")
    setError(null)
  }

  const handleCapture = async (imageBase64: string) => {
    setIsProcessing(true)
    setError(null)

    try {
      const response = await fetch(`/api/user/selfie-search?user_id=${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: imageBase64 }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || result.detail || "Search failed")
      }

      const data = result.data || result

      // Check for no face detected
      if (data.no_face_detected) {
        setError(data.message || "Лицо не обнаружено")
        setStep("capture")
        return
      }

      // Check for collision
      if (data.collision) {
        setCollision(data.collision)
        setStep("collision")
        return
      }

      // Set matches
      setSelfieSearchId(data.selfie_search_id)
      setMatches(data.matches || [])
      setStep("results")

    } catch (err) {
      console.error("Selfie search error:", err)
      setError(err instanceof Error ? err.message : "Ошибка поиска")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleConfirm = async (photoFaceIds: string[]) => {
    if (!selfieSearchId) return

    setIsProcessing(true)
    setError(null)

    try {
      const response = await fetch(`/api/user/confirm-selfie?user_id=${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photo_face_ids: photoFaceIds,
          selfie_search_id: selfieSearchId,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || result.detail || "Confirmation failed")
      }

      const data = result.data || result
      setTotalPhotos(data.total_photos || 0)
      setStep("success")

      // Redirect after delay
      setTimeout(() => {
        onOpenChange(false)
        router.push("/my-photos")
        router.refresh()
      }, 2000)

    } catch (err) {
      console.error("Confirm error:", err)
      setError(err instanceof Error ? err.message : "Ошибка сохранения")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleRetry = () => {
    setMatches([])
    setSelfieSearchId(null)
    setError(null)
    setStep("capture")
  }

  const handleSkip = () => {
    onOpenChange(false)
  }

  const handleClose = () => {
    // Reset state when closing
    setStep("prompt")
    setMatches([])
    setSelfieSearchId(null)
    setCollision(null)
    setError(null)
    onOpenChange(false)
  }

  const getTitle = () => {
    switch (step) {
      case "prompt":
        return "Добро пожаловать!"
      case "capture":
        return "Сделайте селфи"
      case "results":
        return "Результаты поиска"
      case "collision":
        return "Внимание"
      case "success":
        return "Готово!"
      default:
        return ""
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
            {error}
          </div>
        )}

        {step === "prompt" && (
          <SelfiePrompt onStart={handleStartCapture} onSkip={handleSkip} />
        )}

        {step === "capture" && (
          <SelfieCapture
            onCapture={handleCapture}
            onCancel={() => setStep("prompt")}
            isProcessing={isProcessing}
          />
        )}

        {step === "results" && (
          <SelfieResults
            matches={matches}
            selfieSearchId={selfieSearchId || ""}
            onConfirm={handleConfirm}
            onRetry={handleRetry}
            onCancel={handleSkip}
            isProcessing={isProcessing}
          />
        )}

        {step === "collision" && collision && (
          <div className="flex flex-col items-center p-6 text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h3 className="text-lg font-semibold mb-2">
              Похожий человек уже зарегистрирован
            </h3>
            <p className="text-muted-foreground mb-4">
              Возможно, вы уже регистрировались ранее через другой аккаунт.
              Если это ошибка — обратитесь к администратору.
            </p>

            {collision.sample_photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {collision.sample_photos.map((photo, i) => (
                  <img
                    key={i}
                    src={photo.image_url}
                    alt="Sample"
                    className="w-20 h-20 object-cover rounded"
                  />
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleRetry}
                className="text-sm text-primary hover:underline"
              >
                Попробовать другое селфи
              </button>
              <button
                onClick={handleSkip}
                className="text-sm text-muted-foreground hover:underline"
              >
                Закрыть
              </button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center p-6 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h3 className="text-xl font-semibold mb-2">Отлично!</h3>
            <p className="text-muted-foreground mb-4">
              Мы нашли {totalPhotos} ваших фотографий.
              <br />
              Переходим в раздел "Мои фото"...
            </p>
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
