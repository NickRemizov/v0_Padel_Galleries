"use client"

/**
 * Image Lightbox Container
 *
 * Main orchestrator component that composes all lightbox parts.
 * Рефакторинг: 600 строк → 8 модулей
 *
 * @refactored 2025-12-29
 */

import type React from "react"
import { useEffect, useRef } from "react"
import type { ImageLightboxProps } from "./types"
import { useLightboxState } from "./hooks/useLightboxState"
import { useSwipeNavigation } from "./hooks/useSwipeNavigation"
import { trackPhotoView, trackPhotoDownload } from "@/lib/analytics"
import {
  LightboxToolbar,
  NavigationButtons,
  PhotoCounter,
  PeopleLinks,
  FileInfoBar,
  CommentsPanel,
} from "./components"

export function ImageLightbox({
  images,
  currentIndex,
  isOpen,
  onClose,
  onNavigate,
  galleryId,
  gallerySlug,
  currentPlayerId,
  currentPlayerSlug,
}: ImageLightboxProps) {
  const currentImage = images[currentIndex]
  const lastTrackedPhotoId = useRef<string | null>(null)

  // Track photo view when image changes
  useEffect(() => {
    if (isOpen && currentImage?.id && currentImage.id !== lastTrackedPhotoId.current) {
      trackPhotoView(currentImage.id, galleryId || "")
      lastTrackedPhotoId.current = currentImage.id
    }
  }, [isOpen, currentImage?.id, galleryId])

  // State management
  const {
    showCopied,
    showComments,
    verifiedPeople,
    hideUI,
    toggleUI,
    toggleComments,
    showCopiedNotification,
  } = useLightboxState(currentImage)

  // Navigation
  const {
    displayedIndex,
    isSwiping,
    handlePrev,
    handleNext,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    getImageStyle,
  } = useSwipeNavigation({
    imagesLength: images.length,
    currentIndex,
    isOpen,
    onNavigate,
    onClose,
  })

  // Toggle UI visibility on tap
  const handleImageTap = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isSwiping && (e.target as HTMLElement).tagName === 'IMG') {
      toggleUI()
    }
  }

  // Download handler
  const handleDownload = async () => {
    try {
      if (currentImage?.id) {
        // Track in backend
        fetch(`/api/downloads/${currentImage.id}`, {
          method: "POST",
        }).catch((error) => {
          console.error("[v0] Error tracking download:", error)
        })
        // Track in PostHog
        trackPhotoDownload(currentImage.id, galleryId || "")
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

  // Share handler
  const handleShare = async () => {
    const photoSlug = currentImage?.slug || currentImage?.id
    if (!photoSlug) {
      alert("Невозможно создать ссылку на это фото")
      return
    }

    let url: string
    if (galleryId || gallerySlug) {
      const gSlug = gallerySlug || galleryId
      url = `${window.location.origin}/gallery/${gSlug}?photo=${photoSlug}`
    } else if (currentPlayerId || currentPlayerSlug) {
      const pSlug = currentPlayerSlug || currentPlayerId
      url = `${window.location.origin}/players/${pSlug}?photo=${photoSlug}`
    } else {
      url = `${window.location.origin}${window.location.pathname}?photo=${photoSlug}`
    }

    try {
      await navigator.clipboard.writeText(url)
      showCopiedNotification()
    } catch (error) {
      console.error("Error copying to clipboard:", error)
      alert("Не удалось скопировать ссылку")
    }
  }

  if (!isOpen || !currentImage) return null

  const displayedImage = images[displayedIndex]
  const isPlayerGalleryView = !!currentPlayerId && !!currentImage.galleryTitle

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
        {/* Photo counter */}
        <PhotoCounter
          currentIndex={currentIndex}
          total={images.length}
          hideUI={hideUI}
        />

        {/* Verified people links */}
        <PeopleLinks
          verifiedPeople={verifiedPeople}
          currentPlayerId={currentPlayerId}
          hideUI={hideUI}
        />

        {/* Copied notification */}
        {showCopied && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full text-sm z-30">
            Ссылка скопирована в буфер обмена
          </div>
        )}

        {/* Toolbar buttons */}
        <LightboxToolbar
          currentImage={currentImage}
          hideUI={hideUI}
          showComments={showComments}
          onClose={onClose}
          onShare={handleShare}
          onDownload={handleDownload}
          onToggleComments={toggleComments}
        />

        {/* Main image with swipe animation */}
        <img
          key={displayedIndex}
          src={displayedImage?.url || "/placeholder.svg"}
          alt={displayedImage?.alt || ""}
          className="max-w-[95vw] max-h-[95vh] w-auto h-auto object-contain"
          style={getImageStyle()}
        />

        {/* File info */}
        <FileInfoBar
          currentImage={currentImage}
          currentIndex={currentIndex}
          hideUI={hideUI}
          isPlayerGalleryView={isPlayerGalleryView}
        />

        {/* Navigation buttons */}
        <NavigationButtons
          imagesLength={images.length}
          hideUI={hideUI}
          onPrev={handlePrev}
          onNext={handleNext}
        />

        {/* Comments panel */}
        {currentImage?.id && (
          <CommentsPanel
            imageId={currentImage.id}
            showComments={showComments}
            hideUI={hideUI}
          />
        )}
      </div>
    </div>
  )
}
