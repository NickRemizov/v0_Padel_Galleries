"use client"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ChevronLeft, ChevronRight, Check, Minimize2, Maximize2 } from "lucide-react"
import type { ImageFitMode } from "../types"

interface FaceTaggingToolbarProps {
  hasPrevious: boolean
  hasNext: boolean
  saving: boolean
  imageFitMode: ImageFitMode
  onPrevious: () => void
  onNext: () => void
  onSaveWithoutClosing: () => void
  onSetFitMode: (mode: ImageFitMode) => void
}

export function FaceTaggingToolbar({
  hasPrevious,
  hasNext,
  saving,
  imageFitMode,
  onPrevious,
  onNext,
  onSaveWithoutClosing,
  onSetFitMode,
}: FaceTaggingToolbarProps) {
  return (
    <div className="absolute top-4 right-12 flex gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size="sm"
                variant="outline"
                onClick={onPrevious}
                disabled={!hasPrevious || saving}
                className="h-8 w-8 p-0 bg-white text-black hover:bg-gray-100"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Предыдущее фото</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size="sm"
                onClick={onSaveWithoutClosing}
                disabled={saving}
                className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700 text-white"
              >
                <Check className="h-4 w-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Сохранить без закрытия окна</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                size="sm"
                variant="outline"
                onClick={onNext}
                disabled={!hasNext || saving}
                className="h-8 w-8 p-0 bg-white text-black hover:bg-gray-100"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Следующее фото</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={imageFitMode === "contain" ? "default" : "outline"}
              size="sm"
              onClick={() => onSetFitMode("contain")}
              className="h-8 w-8 p-0"
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Вписать в окно</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={imageFitMode === "cover" ? "default" : "outline"}
              size="sm"
              onClick={() => onSetFitMode("cover")}
              className="h-8 w-8 p-0"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Масштаб по длинной стороне</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
