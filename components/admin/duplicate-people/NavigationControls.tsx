"use client"

import { Button } from "@/components/ui/button"

interface NavigationControlsProps {
  currentIndex: number
  totalGroups: number
  processing: boolean
  onPrevious: () => void
  onNext: () => void
}

export function NavigationControls({
  currentIndex,
  totalGroups,
  processing,
  onPrevious,
  onNext,
}: NavigationControlsProps) {
  return (
    <div className="flex items-center justify-between">
      <Button
        variant="outline"
        size="sm"
        onClick={onPrevious}
        disabled={currentIndex === 0 || processing}
      >
        ← Назад
      </Button>
      <span className="text-sm text-muted-foreground">
        Группа {currentIndex + 1} из {totalGroups}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={currentIndex >= totalGroups - 1 || processing}
      >
        Вперед →
      </Button>
    </div>
  )
}
