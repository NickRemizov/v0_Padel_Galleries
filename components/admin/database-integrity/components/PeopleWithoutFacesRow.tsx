"use client"

import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { CheckCircle2, Info } from "lucide-react"

interface PeopleWithoutFacesRowProps {
  names: string[]
  count: number
}

export function PeopleWithoutFacesRow({ names, count }: PeopleWithoutFacesRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between py-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Игроки без фото</span>
            {count === 0 ? (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                OK
              </Badge>
            ) : (
              <Badge variant="secondary">{count}</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Игроки, которым не назначено ни одного фото
          </p>
        </div>
        <Badge variant="outline" className="text-muted-foreground">
          Только информация
        </Badge>
      </div>
      {count > 0 && names.length > 0 && (
        <div className="ml-4 p-3 bg-muted rounded-lg">
          <div className="text-sm leading-relaxed">
            {names.join(", ")}
          </div>
        </div>
      )}
      <Separator />
    </div>
  )
}
