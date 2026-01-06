"use client"

import { useState, useEffect, useRef } from "react"

interface TruncatedNamesProps {
  names: string[]
  className?: string
  maxLines?: number
}

export function TruncatedNames({ names, className = "", maxLines = 2 }: TruncatedNamesProps) {
  const containerRef = useRef<HTMLParagraphElement>(null)
  const [displayNames, setDisplayNames] = useState<string[]>(names)
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container || names.length === 0) return

    // Get line height to calculate max height for 2 lines
    const lineHeight = parseFloat(getComputedStyle(container).lineHeight) || 16
    const maxHeight = lineHeight * maxLines

    // Start with all names
    let visibleNames = [...names]
    let hiddenCount = 0

    // Function to check if text fits
    const checkFit = () => {
      container.textContent = visibleNames.join(", ") + (hiddenCount > 0 ? `, +${hiddenCount}` : "")
      return container.scrollHeight <= maxHeight + 1 // +1 for rounding errors
    }

    // Remove names until it fits
    while (!checkFit() && visibleNames.length > 0) {
      visibleNames.pop()
      hiddenCount = names.length - visibleNames.length
    }

    // If even one name doesn't fit with +X, show just +X
    if (visibleNames.length === 0 && names.length > 0) {
      setDisplayNames([])
      setRemaining(names.length)
    } else {
      setDisplayNames(visibleNames)
      setRemaining(hiddenCount)
    }
  }, [names, maxLines])

  if (names.length === 0) return null

  return (
    <p
      ref={containerRef}
      className={className}
      style={{
        display: "-webkit-box",
        WebkitLineClamp: maxLines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden"
      }}
    >
      {displayNames.length > 0
        ? displayNames.join(", ") + (remaining > 0 ? `, +${remaining}` : "")
        : `+${remaining}`
      }
    </p>
  )
}
