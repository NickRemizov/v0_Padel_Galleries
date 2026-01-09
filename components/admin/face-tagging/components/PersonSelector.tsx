"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Check, Trash2, ChevronsUpDown } from "lucide-react"
import type { Person, TaggedFace } from "@/lib/types"
import { formatPersonDisplayName, getPersonSearchString } from "@/lib/utils/person-display"

interface PersonSelectorProps {
  selectedFace: TaggedFace | null
  people: Person[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPersonSelect: (personId: string) => void
  onRemoveFace: () => void
}

export function PersonSelector({
  selectedFace,
  people,
  open,
  onOpenChange,
  onPersonSelect,
  onRemoveFace,
}: PersonSelectorProps) {
  if (!selectedFace) return null

  const currentPerson = selectedFace.personId
    ? people.find((p) => p.id === selectedFace.personId)
    : null

  return (
    <div className="flex items-center gap-2 ml-auto">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-[250px] justify-between"
          >
            {currentPerson?.real_name || selectedFace.personName || "Выберите человека..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                    onSelect={() => onPersonSelect(person.id)}
                  >
                    <Check
                      className={`mr-2 h-4 w-4 ${
                        selectedFace.personId === person.id ? "opacity-100" : "opacity-0"
                      }`}
                    />
                    {formatPersonDisplayName(person)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selectedFace.personId && selectedFace.verified && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="h-9 w-9 rounded-md bg-white border-2 border-green-500 flex items-center justify-center">
                <Check className="h-4 w-4 text-green-500" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Подтверждено</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {selectedFace.personId && !selectedFace.verified && (
        <Badge variant="secondary" className="whitespace-nowrap">
          {Math.round((selectedFace.recognitionConfidence || 0) * 100)}%
        </Badge>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="destructive" size="icon" onClick={onRemoveFace}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Удалить лицо</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}
