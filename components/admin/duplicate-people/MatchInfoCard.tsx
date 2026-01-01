"use client"

import { Card, CardContent } from "@/components/ui/card"
import { AlertTriangle } from "lucide-react"
import { FIELD_LABELS, FIELD_ICONS } from "./constants"

interface MatchInfoCardProps {
  matchField: string
  matchValue: string
}

export function MatchInfoCard({ matchField, matchValue }: MatchInfoCardProps) {
  return (
    <Card className="bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
      <CardContent className="p-3">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">
            Совпадение по полю: {FIELD_LABELS[matchField] || matchField}
          </span>
        </div>
        <div className="mt-1 text-sm text-amber-600 dark:text-amber-500 flex items-center gap-1">
          {FIELD_ICONS[matchField]}
          <span className="truncate">{matchValue}</span>
        </div>
      </CardContent>
    </Card>
  )
}
