"use client"

import { useEffect, useState } from "react"
import { getPeopleAction } from "@/app/admin/actions/entities"
import { AddPersonDialog } from "./add-person-dialog"
import { PersonList } from "./person-list"
import { Badge } from "@/components/ui/badge"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Filter } from "lucide-react"
import type { Person } from "@/lib/types"

type PersonWithStats = Person & {
  verified_photos_count: number
  high_confidence_photos_count: number
  descriptor_count: number
  has_telegram_auth?: boolean
  has_google_auth?: boolean
}

type FilterType = "telegram" | "gmail" | "auto"

export function PeopleManager() {
  const [people, setPeople] = useState<PersonWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilters, setActiveFilters] = useState<FilterType[]>([])

  useEffect(() => {
    getPeopleAction(true).then(result => {
      setPeople(result.success ? result.data : [])
      setLoading(false)
    })
  }, [])

  // Count people matching each filter
  const telegramCount = people.filter(p => p.has_telegram_auth).length
  const gmailCount = people.filter(p => p.has_google_auth).length
  const autoCount = people.filter(p => p.created_by && !p.created_by.startsWith("admin:")).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Люди</h2>
          <p className="text-muted-foreground">Управление базой людей для распознавания лиц</p>
        </div>
        <div className="flex items-center gap-4">
          {/* Filters */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <ToggleGroup
              type="multiple"
              value={activeFilters}
              onValueChange={(value) => setActiveFilters(value as FilterType[])}
            >
              <ToggleGroupItem value="telegram" aria-label="Telegram" className="gap-1.5 h-9">
                Telegram
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">{telegramCount}</Badge>
              </ToggleGroupItem>
              <ToggleGroupItem value="gmail" aria-label="Gmail" className="gap-1.5 h-9">
                Gmail
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">{gmailCount}</Badge>
              </ToggleGroupItem>
              <ToggleGroupItem value="auto" aria-label="Auto-login" className="gap-1.5 h-9">
                Auto-login
                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">{autoCount}</Badge>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <AddPersonDialog />
        </div>
      </div>
      {loading ? (
        <div className="text-muted-foreground">Загрузка...</div>
      ) : (
        <PersonList people={people} activeFilters={activeFilters} />
      )}
    </div>
  )
}
