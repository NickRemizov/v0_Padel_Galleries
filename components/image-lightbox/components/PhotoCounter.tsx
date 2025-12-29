"use client"

/**
 * Photo Counter
 * 
 * Displays current photo index / total count
 */

import { cn } from "@/lib/utils"

interface PhotoCounterProps {
  currentIndex: number
  total: number
  hideUI: boolean
}

export function PhotoCounter({ currentIndex, total, hideUI }: PhotoCounterProps) {
  return (
    <>
      {/* Mobile - TOP LEFT */}
      <div 
        className={cn(
          "absolute top-4 left-4 md:hidden bg-black/70 text-white px-4 py-2 rounded-full text-sm z-20 transition-opacity duration-200",
          hideUI && "opacity-0 pointer-events-none"
        )}
      >
        {currentIndex + 1} / {total}
      </div>
      
      {/* Desktop - TOP CENTER */}
      <div 
        className={cn(
          "absolute top-4 left-1/2 -translate-x-1/2 md:flex hidden flex-col items-center gap-1 transition-opacity duration-200 z-20",
          hideUI && "opacity-0 pointer-events-none"
        )}
      >
        <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm">
          {currentIndex + 1} / {total}
        </div>
      </div>
    </>
  )
}
