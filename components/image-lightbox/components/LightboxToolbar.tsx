"use client"

/**
 * Lightbox Toolbar
 * 
 * Top toolbar with action buttons:
 * - Close, Share, Download, Comments, Like, Favorite
 */

import { X, Download, LinkIcon, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LikeButton } from "@/components/like-button"
import { FavoriteButton } from "@/components/favorite-button"
import { cn } from "@/lib/utils"
import type { LightboxImage } from "../types"

interface LightboxToolbarProps {
  currentImage: LightboxImage
  hideUI: boolean
  showComments: boolean
  onClose: () => void
  onShare: () => void
  onDownload: () => void
  onToggleComments: () => void
}

export function LightboxToolbar({
  currentImage,
  hideUI,
  showComments,
  onClose,
  onShare,
  onDownload,
  onToggleComments,
}: LightboxToolbarProps) {
  return (
    <>
      {/* Close button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute top-4 right-4 text-white hover:bg-white/20 bg-black/50 transition-opacity duration-200 z-20",
          hideUI && "opacity-0 pointer-events-none"
        )}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <X className="h-6 w-6" />
      </Button>

      {/* Share button */}
      {currentImage?.id && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "absolute top-4 right-16 text-white hover:bg-white/20 bg-black/50 transition-opacity duration-200 z-20",
            hideUI && "opacity-0 pointer-events-none"
          )}
          onClick={(e) => { e.stopPropagation(); onShare(); }}
          title="Скопировать ссылку на фото"
        >
          <LinkIcon className="h-6 w-6" />
        </Button>
      )}

      {/* Download button */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute top-4 right-28 text-white hover:bg-white/20 bg-black/50 transition-opacity duration-200 z-20",
          hideUI && "opacity-0 pointer-events-none"
        )}
        onClick={(e) => { e.stopPropagation(); onDownload(); }}
      >
        <Download className="h-6 w-6" />
      </Button>

      {/* Comments button */}
      {currentImage?.id && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "absolute top-4 right-40 text-white hover:bg-white/20 bg-black/50 transition-opacity duration-200 z-20",
            showComments && "bg-white/30",
            hideUI && "opacity-0 pointer-events-none"
          )}
          onClick={(e) => { e.stopPropagation(); onToggleComments(); }}
          title="Комментарии"
        >
          <MessageCircle className="h-6 w-6" />
        </Button>
      )}

      {/* Like button */}
      {currentImage?.id && (
        <div 
          className={cn(
            "absolute top-4 right-52 z-20 transition-opacity duration-200",
            hideUI && "opacity-0 pointer-events-none"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <LikeButton
            imageId={currentImage.id}
            className="bg-black/50 text-white hover:bg-black/60"
          />
        </div>
      )}

      {/* Favorite button */}
      {currentImage?.id && (
        <div
          className={cn(
            "absolute top-4 right-64 z-20 transition-opacity duration-200",
            hideUI && "opacity-0 pointer-events-none"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <FavoriteButton
            imageId={currentImage.id}
            className="bg-black/50 text-white hover:bg-black/60"
          />
        </div>
      )}
    </>
  )
}
