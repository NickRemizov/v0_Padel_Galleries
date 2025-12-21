"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { X, ChevronLeft, ChevronRight, Download, LinkIcon, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LikeButton } from "@/components/like-button"
import { FavoriteButton } from "@/components/favorite-button"
import { CommentsSection } from "@/components/comments-section"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface ImageLightboxProps {
  images: Array<{
    id?: string
    url: string
    originalUrl: string
    alt: string
    filename?: string
    fileSize?: number
    width?: number
    height?: number
    galleryTitle?: string
    galleryDate?: string
  }>
  currentIndex: number
  isOpen: boolean
  onClose: () => void
  onNavigate: (index: number) => void
  galleryId?: string
  currentPlayerId?: string
}

export function ImageLightbox({
  images,
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
  galleryId,
  currentPlayerId,
}: ImageLightboxProps) {
  const currentImage = images[currentIndex]
  const [showCopied, setShowCopied] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [verifiedPeople, setVerifiedPeople] = useState<Array<{ id: string; name: string }>>([])
  
  // UI visibility state - toggle by tap
  const [hideUI, setHideUI] = useState(false)
  
  // Swipe state
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isMultiTouch, setIsMultiTouch] = useState(false)
  const [isSwiping, setIsSwiping] = useState(false)
  
  // Animation state - separate from swipe to prevent double movement
  const [animatingTo, setAnimatingTo] = useState<'left' | 'right' | null>(null)
  const animationRef = useRef<NodeJS.Timeout | null>(null)

  const minSwipeDistance = 50

  // Get previous and next image indices
  const prevIndex = currentIndex === 0 ? images.length - 1 : currentIndex - 1
  const nextIndex = currentIndex === images.length - 1 ? 0 : currentIndex + 1
  const prevImage = images[prevIndex]
  const nextImage = images[nextIndex]

  useEffect(() => {
    const fetchVerifiedPeople = async () => {
      if (!currentImage?.id) {
        setVerifiedPeople([])
        return
      }

      try {
        const response = await fetch(`/api/images/${currentImage.id}/people`)
        if (response.ok) {
          const people = await response.json()
          setVerifiedPeople(people)
        } else {
          setVerifiedPeople([])
        }
      } catch (error) {
        console.error("[v0] Error fetching verified people:", error)
        setVerifiedPeople([])
      }
    }

    fetchVerifiedPeople()
  }, [currentImage?.id])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        handlePrev()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        handleNext()
      } else if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, currentIndex, images.length])

  // Cleanup animation timeout on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current)
      }
    }
  }, [])

  // Reset animation state when currentIndex changes (after navigation)
  useEffect(() => {
    setAnimatingTo(null)
    setSwipeOffset(0)
  }, [currentIndex])

  const formatDateDDMM = (dateString?: string) => {
    if (!dateString) return ""

    const date = new Date(dateString)
    const day = String(date.getDate()).padStart(2, "0")
    const month = String(date.getMonth() + 1).padStart(2, "0")

    return `${day}.${month}`
  }

  // Toggle UI visibility on tap
  const handleImageTap = (e: React.MouseEvent | React.TouchEvent) => {
    // Only toggle if not swiping and tap is on the image area
    if (!isSwiping && (e.target as HTMLElement).tagName === 'IMG') {
      setHideUI(prev => !prev)
    }
  }

  const onTouchStart = (e: React.TouchEvent) => {
    // Detect multi-touch (pinch zoom)
    if (e.touches.length > 1) {
      setIsMultiTouch(true)
      setTouchStartX(null)
      setSwipeOffset(0)
      return
    }
    
    setIsMultiTouch(false)
    setTouchStartX(e.targetTouches[0].clientX)
    setSwipeOffset(0)
    setIsSwiping(false)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    // Ignore if multi-touch (zoom gesture)
    if (isMultiTouch || e.touches.length > 1) {
      setIsMultiTouch(true)
      setSwipeOffset(0)
      return
    }
    
    if (touchStartX === null) return
    
    const currentTouch = e.targetTouches[0].clientX
    const offset = currentTouch - touchStartX
    
    // Mark as swiping if moved more than 10px
    if (Math.abs(offset) > 10) {
      setIsSwiping(true)
    }
    
    // Limit the offset
    const limitedOffset = Math.max(-150, Math.min(150, offset))
    setSwipeOffset(limitedOffset)
  }

  const onTouchEnd = () => {
    // Ignore if was multi-touch
    if (isMultiTouch) {
      setIsMultiTouch(false)
      setSwipeOffset(0)
      setIsSwiping(false)
      return
    }
    
    if (touchStartX === null) {
      setSwipeOffset(0)
      setIsSwiping(false)
      return
    }

    const isLeftSwipe = swipeOffset < -minSwipeDistance  // swipe left = go to next
    const isRightSwipe = swipeOffset > minSwipeDistance  // swipe right = go to prev

    if (isLeftSwipe && images.length > 1) {
      // Animate current out to left, then navigate
      setAnimatingTo('left')
      animationRef.current = setTimeout(() => {
        const nextIdx = currentIndex === images.length - 1 ? 0 : currentIndex + 1
        onNavigate(nextIdx)
      }, 200)
    } else if (isRightSwipe && images.length > 1) {
      // Animate current out to right, then navigate
      setAnimatingTo('right')
      animationRef.current = setTimeout(() => {
        const prevIdx = currentIndex === 0 ? images.length - 1 : currentIndex - 1
        onNavigate(prevIdx)
      }, 200)
    } else {
      // Snap back
      setSwipeOffset(0)
    }

    setTouchStartX(null)
    
    // Reset swiping flag after a short delay
    setTimeout(() => setIsSwiping(false), 100)
  }

  const handleDownload = async () => {
    try {
      if (currentImage?.id) {
        fetch(`/api/downloads/${currentImage.id}`, {
          method: "POST",
        }).catch((error) => {
          console.error("[v0] Error tracking download:", error)
        })
      }

      const response = await fetch(currentImage.originalUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = currentImage.filename || `image-${currentIndex + 1}.jpg`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error("Error downloading image:", error)
    }
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "N/A"
    return `${(bytes / 1024).toFixed(0)} KB`
  }

  const formatDimensions = (width?: number, height?: number) => {
    if (!width || !height) return ""
    return `${width} × ${height} px`
  }

  const handlePrev = () => {
    const prevIndex = currentIndex === 0 ? images.length - 1 : currentIndex - 1
    onNavigate(prevIndex)
  }

  const handleNext = () => {
    const nextIndex = currentIndex === images.length - 1 ? 0 : currentIndex + 1
    onNavigate(nextIndex)
  }

  const handleShare = async () => {
    if (!currentImage?.id) {
      alert("Невозможно создать ссылку на это фото")
      return
    }

    let url: string
    if (galleryId) {
      url = `${window.location.origin}/gallery/${galleryId}?photo=${currentImage.id}`
    } else if (currentPlayerId) {
      url = `${window.location.origin}/players/${currentPlayerId}?photo=${currentImage.id}`
    } else {
      url = `${window.location.origin}${window.location.pathname}?photo=${currentImage.id}`
    }

    try {
      await navigator.clipboard.writeText(url)
      setShowCopied(true)
      setTimeout(() => setShowCopied(false), 2000)
    } catch (error) {
      console.error("Error copying to clipboard:", error)
      alert("Не удалось скопировать ссылку")
    }
  }

  // Calculate transform for current image
  const getCurrentImageTransform = () => {
    if (animatingTo === 'left') {
      return 'translateX(-100vw)'
    } else if (animatingTo === 'right') {
      return 'translateX(100vw)'
    }
    return `translateX(${swipeOffset}px)`
  }

  // Calculate transform for adjacent images
  const getAdjacentImageTransform = (position: 'prev' | 'next') => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1000
    
    if (animatingTo === 'left' && position === 'next') {
      // Next slides in from right to center
      return 'translateX(0)'
    } else if (animatingTo === 'right' && position === 'prev') {
      // Prev slides in from left to center
      return 'translateX(0)'
    }
    
    // During swipe, show adjacent images peeking
    if (swipeOffset !== 0 && !animatingTo) {
      if (position === 'prev' && swipeOffset > 0) {
        return `translateX(calc(-100% + ${swipeOffset}px))`
      } else if (position === 'next' && swipeOffset < 0) {
        return `translateX(calc(100% + ${swipeOffset}px))`
      }
    }
    
    // Default: hidden off-screen
    return position === 'prev' ? 'translateX(-100vw)' : 'translateX(100vw)'
  }

  if (!isOpen || !currentImage) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/90" onClick={onClose} />

      {/* Content */}
      <div
        className="relative z-10 flex items-center justify-center w-full h-full"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleImageTap}
      >
        {/* Photo counter - TOP LEFT on mobile */}
        <div 
          className={cn(
            "absolute top-4 left-4 md:hidden bg-black/70 text-white px-4 py-2 rounded-full text-sm z-20 transition-opacity duration-200",
            hideUI && "opacity-0 pointer-events-none"
          )}
        >
          {currentIndex + 1} / {images.length}
        </div>
        
        {/* Photo counter - TOP CENTER on desktop */}
        <div 
          className={cn(
            "absolute top-4 left-1/2 -translate-x-1/2 md:block hidden bg-black/70 text-white px-4 py-2 rounded-full text-sm transition-opacity duration-200",
            hideUI && "opacity-0 pointer-events-none"
          )}
        >
          {currentIndex + 1} / {images.length}
        </div>

        {/* Verified people names - BOTTOM LEFT on mobile */}
        {verifiedPeople.length > 0 && (
          <div 
            className={cn(
              "absolute md:top-4 md:left-4 bottom-4 left-4 md:bottom-auto flex flex-col gap-1 z-20 transition-opacity duration-200",
              hideUI && "opacity-0 pointer-events-none"
            )}
          >
            {verifiedPeople.map((person) => {
              const isCurrentPlayer = person.id === currentPlayerId
              return isCurrentPlayer ? (
                <div
                  key={person.id}
                  className="bg-black/70 text-white/50 px-3 py-1.5 rounded-full text-sm cursor-default"
                >
                  {person.name}
                </div>
              ) : (
                <Link
                  key={person.id}
                  href={`/players/${person.id}`}
                  className="bg-black/70 hover:bg-black/80 text-white px-3 py-1.5 rounded-full text-sm transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {person.name}
                </Link>
              )
            })}
          </div>
        )}

        {showCopied && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full text-sm z-30">
            Ссылка скопирована в буфер обмена
          </div>
        )}

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
            onClick={(e) => { e.stopPropagation(); handleShare(); }}
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
          onClick={(e) => { e.stopPropagation(); handleDownload(); }}
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
            onClick={(e) => { e.stopPropagation(); setShowComments(!showComments); }}
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

        {/* Images container for carousel effect */}
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          {/* Previous image */}
          {images.length > 1 && prevImage && (
            <img
              src={prevImage.url || "/placeholder.svg"}
              alt={prevImage.alt}
              className={cn(
                "absolute max-w-[95vw] max-h-[95vh] w-auto h-auto object-contain",
                animatingTo ? "transition-transform duration-200 ease-out" : ""
              )}
              style={{
                transform: getAdjacentImageTransform('prev'),
              }}
            />
          )}

          {/* Current image */}
          <img
            src={currentImage.url || "/placeholder.svg"}
            alt={currentImage.alt}
            className={cn(
              "max-w-[95vw] max-h-[95vh] w-auto h-auto object-contain",
              animatingTo ? "transition-transform duration-200 ease-out" : ""
            )}
            style={{
              transform: getCurrentImageTransform(),
            }}
          />

          {/* Next image */}
          {images.length > 1 && nextImage && (
            <img
              src={nextImage.url || "/placeholder.svg"}
              alt={nextImage.alt}
              className={cn(
                "absolute max-w-[95vw] max-h-[95vh] w-auto h-auto object-contain",
                animatingTo ? "transition-transform duration-200 ease-out" : ""
              )}
              style={{
                transform: getAdjacentImageTransform('next'),
              }}
            />
          )}
        </div>

        {/* File info - BOTTOM CENTER on desktop */}
        <div 
          className={cn(
            "absolute bottom-4 left-1/2 -translate-x-1/2 md:block hidden bg-black/70 text-white px-4 py-2 rounded-full text-sm transition-opacity duration-200 z-20",
            hideUI && "opacity-0 pointer-events-none"
          )}
        >
          {currentImage.filename || `image-${currentIndex + 1}.jpg`}
          {currentPlayerId && currentImage.galleryTitle && (
            <>
              {" | "}
              {currentImage.galleryTitle}
              {currentImage.galleryDate && ` ${formatDateDDMM(currentImage.galleryDate)}`}
            </>
          )}
          {formatDimensions(currentImage.width, currentImage.height) && (
            <> | {formatDimensions(currentImage.width, currentImage.height)}</>
          )}
          {" | "}
          {formatFileSize(currentImage.fileSize)}
        </div>
        
        {/* Filename - BOTTOM RIGHT on mobile - INVERTED: hidden by default, shown when hideUI is true */}
        <div 
          className={cn(
            "absolute bottom-4 right-4 md:hidden bg-black/70 text-white px-4 py-2 rounded-full text-sm transition-opacity duration-200 z-20",
            !hideUI && "opacity-0 pointer-events-none"
          )}
        >
          {currentImage.filename || `image-${currentIndex + 1}.jpg`}
        </div>

        {/* Previous button */}
        {images.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 bg-black/50 transition-opacity duration-200 z-20",
              hideUI && "opacity-0 pointer-events-none"
            )}
            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
        )}

        {/* Next button */}
        {images.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 bg-black/50 transition-opacity duration-200 z-20",
              hideUI && "opacity-0 pointer-events-none"
            )}
            onClick={(e) => { e.stopPropagation(); handleNext(); }}
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        )}

        {/* Comments panel */}
        {showComments && currentImage?.id && (
          <div 
            className={cn(
              "absolute right-4 top-20 bottom-20 w-96 bg-background rounded-lg shadow-xl overflow-hidden flex flex-col transition-opacity duration-200 z-30",
              hideUI && "opacity-0 pointer-events-none"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-1 overflow-y-auto p-4">
              <CommentsSection imageId={currentImage.id} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
