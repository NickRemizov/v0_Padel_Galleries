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
            <p>\u041f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0435\u0435 \u0444\u043e\u0442\u043e</p>
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
            <p>\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0431\u0435\u0437 \u0437\u0430\u043a\u0440\u044b\u0442\u0438\u044f \u043e\u043a\u043d\u0430</p>
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
            <p>\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0435 \u0444\u043e\u0442\u043e</p>
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
            <p>\u0412\u043f\u0438\u0441\u0430\u0442\u044c \u0432 \u043e\u043a\u043d\u043e</p>
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
            <p>\u041c\u0430\u0441\u0448\u0442\u0430\u0431 \u043f\u043e \u0434\u043b\u0438\u043d\u043d\u043e\u0439 \u0441\u0442\u043e\u0440\u043e\u043d\u0435</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
