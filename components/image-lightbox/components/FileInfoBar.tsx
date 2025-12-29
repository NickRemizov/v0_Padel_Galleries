"use client"

/**
 * File Info Bar
 * 
 * Displays file information (filename, dimensions, size)
 * Desktop: bottom center
 * Mobile: bottom right (only when UI is hidden)
 */

import { cn } from "@/lib/utils"
import { formatDateDDMM, formatFileSize, formatDimensions } from "../utils"
import type { LightboxImage } from "../types"

interface FileInfoBarProps {
  currentImage: LightboxImage
  currentIndex: number
  hideUI: boolean
  isPlayerGalleryView: boolean
}

export function FileInfoBar({
  currentImage,
  currentIndex,
  hideUI,
  isPlayerGalleryView,
}: FileInfoBarProps) {
  return (
    <>
      {/* Desktop - BOTTOM CENTER */}
      <div 
        className={cn(
          "absolute bottom-4 left-1/2 -translate-x-1/2 md:flex hidden flex-col items-center gap-1 max-w-[90vw] transition-opacity duration-200 z-20",
          hideUI && "opacity-0 pointer-events-none"
        )}
      >
        {/* Line 1: Gallery title (if from player gallery) */}
        {isPlayerGalleryView && (
          <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm text-center">
            {currentImage.galleryTitle}
            {currentImage.galleryDate && ` ${formatDateDDMM(currentImage.galleryDate)}`}
          </div>
        )}
        {/* Line 2: Filename and file info */}
        <div className="bg-black/70 text-white px-4 py-2 rounded-full text-sm text-center whitespace-nowrap">
          {currentImage.filename || `image-${currentIndex + 1}.jpg`}
          {formatDimensions(currentImage.width, currentImage.height) && (
            <> | {formatDimensions(currentImage.width, currentImage.height)}</>
          )}
          {" | "}
          {formatFileSize(currentImage.fileSize)}
        </div>
      </div>
      
      {/* Mobile - BOTTOM RIGHT (shown when UI is hidden) */}
      <div 
        className={cn(
          "absolute bottom-4 right-4 md:hidden bg-black/70 text-white px-4 py-2 rounded-full text-sm transition-opacity duration-200 z-20",
          !hideUI && "opacity-0 pointer-events-none"
        )}
      >
        {currentImage.filename || `image-${currentIndex + 1}.jpg`}
      </div>
    </>
  )
}
