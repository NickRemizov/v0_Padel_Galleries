"use client"

/**
 * Swipe Navigation Hook
 * 
 * Handles touch/swipe gestures for image navigation:
 * - Touch start/move/end
 * - Multi-touch detection (for zoom)
 * - Swipe animation
 * - Keyboard navigation
 */

import { useState, useEffect, useRef, useCallback } from "react"
import type React from "react"

interface UseSwipeNavigationProps {
  imagesLength: number
  currentIndex: number
  isOpen: boolean
  onNavigate: (index: number) => void
  onClose: () => void
}

export function useSwipeNavigation({
  imagesLength,
  currentIndex,
  isOpen,
  onNavigate,
  onClose,
}: UseSwipeNavigationProps) {
  // Swipe state
  const [touchStartX, setTouchStartX] = useState<number | null>(null)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [isMultiTouch, setIsMultiTouch] = useState(false)
  const [isSwiping, setIsSwiping] = useState(false)
  
  // Track displayed index separately for smooth transitions
  const [displayedIndex, setDisplayedIndex] = useState(currentIndex)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const minSwipeDistance = 50

  // Use ref to track current index for keyboard navigation
  const currentIndexRef = useRef(currentIndex)
  const isTransitioningRef = useRef(isTransitioning)
  
  useEffect(() => {
    currentIndexRef.current = currentIndex
  }, [currentIndex])
  
  useEffect(() => {
    isTransitioningRef.current = isTransitioning
  }, [isTransitioning])

  // Sync displayedIndex with currentIndex on prop change
  useEffect(() => {
    if (currentIndex !== displayedIndex && !isTransitioning) {
      setDisplayedIndex(currentIndex)
    }
  }, [currentIndex, displayedIndex, isTransitioning])

  const navigateWithAnimation = useCallback((direction: 'prev' | 'next') => {
    if (isTransitioningRef.current) return
    
    setIsTransitioning(true)
    
    // Animate out current image
    setSwipeOffset(direction === 'next' ? -200 : 200)
    
    // After animation, switch image
    setTimeout(() => {
      const idx = currentIndexRef.current
      const newIndex = direction === 'next'
        ? (idx === imagesLength - 1 ? 0 : idx + 1)
        : (idx === 0 ? imagesLength - 1 : idx - 1)
      
      setSwipeOffset(0)
      setDisplayedIndex(newIndex)
      onNavigate(newIndex)
      
      setTimeout(() => {
        setIsTransitioning(false)
      }, 50)
    }, 150)
  }, [imagesLength, onNavigate])

  const handlePrev = useCallback(() => {
    navigateWithAnimation('prev')
  }, [navigateWithAnimation])

  const handleNext = useCallback(() => {
    navigateWithAnimation('next')
  }, [navigateWithAnimation])

  // Keyboard navigation
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
  }, [isOpen, handlePrev, handleNext, onClose])

  // Touch handlers
  const onTouchStart = (e: React.TouchEvent) => {
    if (isTransitioning) return
    
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
    if (isTransitioning) return
    
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
    
    // Limit the offset for visual feedback
    const limitedOffset = Math.max(-100, Math.min(100, offset))
    setSwipeOffset(limitedOffset)
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (isTransitioning) return
    
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

    const touchEndX = e.changedTouches[0]?.clientX ?? touchStartX
    const distance = touchStartX - touchEndX
    
    const isLeftSwipe = distance > minSwipeDistance  // swipe left = go to next
    const isRightSwipe = distance < -minSwipeDistance  // swipe right = go to prev

    if (isLeftSwipe && imagesLength > 1) {
      navigateWithAnimation('next')
    } else if (isRightSwipe && imagesLength > 1) {
      navigateWithAnimation('prev')
    } else {
      // Snap back
      setSwipeOffset(0)
    }

    setTouchStartX(null)
    setTimeout(() => setIsSwiping(false), 100)
  }

  // Get transform and opacity for smooth animation
  const getImageStyle = () => {
    const baseTransform = `translateX(${swipeOffset}px)`
    const scale = isTransitioning ? 0.95 : 1
    const opacity = isTransitioning ? 0.7 : 1
    
    return {
      transform: `${baseTransform} scale(${scale})`,
      opacity,
      transition: isTransitioning || swipeOffset === 0 
        ? 'transform 150ms ease-out, opacity 150ms ease-out' 
        : 'none',
    }
  }

  return {
    displayedIndex,
    isSwiping,
    swipeOffset,
    isTransitioning,
    handlePrev,
    handleNext,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    getImageStyle,
  }
}
