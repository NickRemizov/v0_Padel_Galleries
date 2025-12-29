"use client"

/**
 * Comments Panel
 * 
 * Sidebar panel for viewing/adding comments
 */

import { cn } from "@/lib/utils"
import { CommentsSection } from "@/components/comments-section"

interface CommentsPanelProps {
  imageId: string
  showComments: boolean
  hideUI: boolean
}

export function CommentsPanel({ imageId, showComments, hideUI }: CommentsPanelProps) {
  if (!showComments) return null

  return (
    <div 
      className={cn(
        "absolute right-4 top-20 bottom-20 w-96 bg-background rounded-lg shadow-xl overflow-hidden flex flex-col transition-opacity duration-200 z-30",
        hideUI && "opacity-0 pointer-events-none"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex-1 overflow-y-auto p-4">
        <CommentsSection imageId={imageId} />
      </div>
    </div>
  )
}
