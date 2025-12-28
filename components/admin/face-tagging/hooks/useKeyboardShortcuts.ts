"use client"

import { useEffect } from "react"

interface UseKeyboardShortcutsProps {
  open: boolean
  selectedFaceIndex: number | null
  onRemoveFace: (index: number) => void
}

/**
 * Hook for keyboard shortcuts in face tagging dialog
 */
export function useKeyboardShortcuts({
  open,
  selectedFaceIndex,
  onRemoveFace,
}: UseKeyboardShortcutsProps) {
  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      // Delete selected face with Delete key
      if (e.key === "Delete" && selectedFaceIndex !== null) {
        const activeElement = document.activeElement
        // Don't handle if focus is in an input
        if (
          activeElement &&
          (activeElement.tagName === "INPUT" ||
            activeElement.tagName === "SELECT" ||
            activeElement.tagName === "TEXTAREA")
        ) {
          return
        }
        e.preventDefault()
        onRemoveFace(selectedFaceIndex)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, selectedFaceIndex, onRemoveFace])
}
