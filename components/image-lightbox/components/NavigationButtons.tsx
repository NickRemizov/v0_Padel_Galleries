"use client"

/**
 * Navigation Buttons
 * 
 * Previous/Next arrow buttons for image navigation
 */

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface NavigationButtonsProps {
  imagesLength: number
  hideUI: boolean
  onPrev: () => void
  onNext: () => void
}

export function NavigationButtons({
  imagesLength,
  hideUI,
  onPrev,
  onNext,
}: NavigationButtonsProps) {
  if (imagesLength <= 1) return null

  return (
    <>
      {/* Previous button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 bg-black/50 transition-opacity duration-200 z-20",
          hideUI && "opacity-0 pointer-events-none"
        )}
        onClick={(e) => { e.stopPropagation(); onPrev(); }}
      >
        <ChevronLeft className="h-8 w-8" />
      </Button>

      {/* Next button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 bg-black/50 transition-opacity duration-200 z-20",
          hideUI && "opacity-0 pointer-events-none"
        )}
        onClick={(e) => { e.stopPropagation(); onNext(); }}
      >
        <ChevronRight className="h-8 w-8" />
      </Button>
    </>
  )
}
