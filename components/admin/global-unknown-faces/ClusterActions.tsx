"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { UserPlus, Users, ChevronLeft, ChevronRight, Trash2 } from "lucide-react"
import type { Person } from "@/lib/types"
import { formatPersonDisplayName, getPersonSearchString } from "@/lib/utils/person-display"

interface ClusterActionsProps {
  currentIndex: number
  totalClusters: number
  clusterSize: number
  people: Person[]
  processing: boolean
  hasPrevious: boolean
  hasNext: boolean
  onCreatePerson: () => void
  onSelectPerson: (personId: string) => void
  onRejectCluster: () => void
  onPrevious: () => void
  onNext: () => void
}

export function ClusterActions({
  currentIndex,
  totalClusters,
  clusterSize,
  people,
  processing,
  hasPrevious,
  hasNext,
  onCreatePerson,
  onSelectPerson,
  onRejectCluster,
  onPrevious,
  onNext,
}: ClusterActionsProps) {
  const [showSelectPerson, setShowSelectPerson] = useState(false)

  const handleSelectPerson = (personId: string) => {
    if (!personId) return
    setShowSelectPerson(false)
    onSelectPerson(personId)
  }

  return (
    <div className="flex-shrink-0 flex items-center justify-between pt-4 border-t">
      <p className="text-sm text-muted-foreground">
        Кластер {currentIndex + 1} из {totalClusters} (всего {clusterSize} фото)
      </p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          onClick={onRejectCluster}
          disabled={processing}
          title="Удалить весь кластер"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Отклонить
        </Button>

        <Button variant="outline" onClick={onCreatePerson} disabled={processing}>
          <UserPlus className="h-4 w-4 mr-2" />
          Создать игрока
        </Button>

        <Popover open={showSelectPerson} onOpenChange={setShowSelectPerson}>
          <PopoverTrigger asChild>
            <Button variant="outline" disabled={processing}>
              <Users className="h-4 w-4 mr-2" />
              Выбрать игрока
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0">
            <Command>
              <CommandInput placeholder="Поиск игрока..." />
              <CommandList>
                <CommandEmpty>Игрок не найден</CommandEmpty>
                <CommandGroup className="max-h-[300px] overflow-y-auto">
                  {people.map((person) => (
                    <CommandItem
                      key={person.id}
                      value={getPersonSearchString(person)}
                      onSelect={() => handleSelectPerson(person.id)}
                    >
                      {formatPersonDisplayName(person)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button
          variant="outline"
          size="icon"
          onClick={onPrevious}
          disabled={!hasPrevious || processing}
          title="Предыдущий кластер"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onNext}
          disabled={!hasNext || processing}
          title="Следующий кластер"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
