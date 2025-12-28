"use client"

import { Button } from "@/components/ui/button"
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Check, Trash2, ArrowUpDown, ArrowUp } from "lucide-react"
import type { VerifyButtonState } from "../types"

interface PersonGalleryHeaderProps {
  personName: string
  photosCount: number
  unverifiedCount: number
  selectedCount: number
  showUnverifiedFirst: boolean
  verifyButtonState: VerifyButtonState
  onToggleUnverifiedFirst: () => void
  onBatchVerify: () => void
  onBatchDelete: () => void
}

export function PersonGalleryHeader({
  personName,
  photosCount,
  unverifiedCount,
  selectedCount,
  showUnverifiedFirst,
  verifyButtonState,
  onToggleUnverifiedFirst,
  onBatchVerify,
  onBatchDelete,
}: PersonGalleryHeaderProps) {
  return (
    <div className="sticky top-0 z-10 pb-4 border-b">
      <DialogHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogTitle>\u0413\u0430\u043b\u0435\u0440\u0435\u044f: {personName}</DialogTitle>
            <DialogDescription>
              \u0424\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u0438 \u0441 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u043d\u044b\u043c \u0440\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u0432\u0430\u043d\u0438\u0435\u043c \u0438\u043b\u0438 \u0432\u044b\u0441\u043e\u043a\u043e\u0439 \u0443\u0432\u0435\u0440\u0435\u043d\u043d\u043e\u0441\u0442\u044c\u044e
            </DialogDescription>
          </div>
          {photosCount > 0 && (
            <div className="flex gap-2 shrink-0 mr-12">
              <Button
                variant={showUnverifiedFirst ? "default" : "outline"}
                size="sm"
                onClick={onToggleUnverifiedFirst}
                className={`w-[220px] justify-start ${showUnverifiedFirst ? "bg-blue-500 hover:bg-blue-600" : ""}`}
                disabled={unverifiedCount === 0}
              >
                {showUnverifiedFirst ? (
                  <ArrowUp className="h-4 w-4 mr-2 flex-shrink-0" />
                ) : (
                  <ArrowUpDown className="h-4 w-4 mr-2 flex-shrink-0" />
                )}
                <span className="truncate">
                  {showUnverifiedFirst ? "\u041e\u0431\u044b\u0447\u043d\u044b\u0439 \u043f\u043e\u0440\u044f\u0434\u043e\u043a" : "\u0412\u043d\u0430\u0447\u0430\u043b\u0435 \u043d\u0435\u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d\u043d\u044b\u0435"}
                </span>
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={verifyButtonState.disabled}
                onClick={onBatchVerify}
                className="w-[220px] justify-start bg-green-500 hover:bg-green-600 text-white disabled:bg-gray-300 disabled:text-gray-500"
              >
                <Check className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="truncate">{verifyButtonState.text}</span>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={selectedCount === 0}
                onClick={onBatchDelete}
                className="min-w-[200px] justify-start"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {selectedCount > 0
                  ? `\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0438\u0433\u0440\u043e\u043a\u0430 \u0441 ${selectedCount} \u0444\u043e\u0442\u043e`
                  : "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0438\u0433\u0440\u043e\u043a\u0430 \u0441 \u0444\u043e\u0442\u043e"}
              </Button>
            </div>
          )}
        </div>
      </DialogHeader>
    </div>
  )
}
