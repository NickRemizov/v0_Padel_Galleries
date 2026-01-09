"use client"

import { Button } from "@/components/ui/button"
import { Camera, X } from "lucide-react"

interface SelfiePromptProps {
  onStart: () => void
  onSkip: () => void
}

export function SelfiePrompt({ onStart, onSkip }: SelfiePromptProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
        <Camera className="w-12 h-12 text-primary" />
      </div>

      <h2 className="text-2xl font-bold mb-2">Найдём ваши фотографии?</h2>

      <p className="text-muted-foreground mb-6 max-w-sm">
        Сделайте селфи, и мы автоматически найдём все ваши фотографии с прошедших турниров
      </p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <Button size="lg" onClick={onStart} className="w-full">
          <Camera className="w-5 h-5 mr-2" />
          Сделать селфи
        </Button>

        <Button variant="ghost" size="sm" onClick={onSkip} className="w-full">
          Пропустить
        </Button>
      </div>
    </div>
  )
}
