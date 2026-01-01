"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Users, Merge, Loader2 } from "lucide-react"
import type { DuplicatePeopleDialogProps } from "./types"
import { useDuplicatePeople } from "./useDuplicatePeople"
import { PersonCard } from "./PersonCard"
import { MatchInfoCard } from "./MatchInfoCard"
import { NavigationControls } from "./NavigationControls"

export function DuplicatePeopleDialog({ open, onOpenChange }: DuplicatePeopleDialogProps) {
  const {
    loading,
    duplicateGroups,
    currentGroupIndex,
    currentGroup,
    selectedKeepId,
    processing,
    setSelectedKeepId,
    handleLoadDuplicates,
    handleDelete,
    handleMerge,
    handleNextGroup,
    handlePrevGroup,
  } = useDuplicatePeople()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Поиск дубликатов игроков
          </DialogTitle>
          <DialogDescription>
            Поиск игроков с совпадающими контактными данными (Gmail, Telegram, Facebook, Instagram)
          </DialogDescription>
        </DialogHeader>

        {duplicateGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Users className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground text-center">
              Нажмите кнопку для поиска дубликатов
            </p>
            <Button onClick={handleLoadDuplicates} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Поиск...
                </>
              ) : (
                <>
                  <Users className="mr-2 h-4 w-4" />
                  Найти дубликаты
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <NavigationControls
              currentIndex={currentGroupIndex}
              totalGroups={duplicateGroups.length}
              processing={processing}
              onPrevious={handlePrevGroup}
              onNext={handleNextGroup}
            />

            {currentGroup && (
              <>
                <MatchInfoCard
                  matchField={currentGroup.matchField}
                  matchValue={currentGroup.matchValue}
                />

                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Выберите игрока, которого оставить (остальные будут объединены с ним):
                  </p>
                  {currentGroup.people.map((person) => (
                    <PersonCard
                      key={person.id}
                      person={person}
                      isSelected={person.id === selectedKeepId}
                      processing={processing}
                      onSelect={() => setSelectedKeepId(person.id)}
                      onDelete={() => handleDelete(person.id)}
                    />
                  ))}
                </div>

                <Separator />

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={processing}
                  >
                    Закрыть
                  </Button>
                  <Button
                    onClick={handleMerge}
                    disabled={!selectedKeepId || processing || currentGroup.people.length < 2}
                  >
                    {processing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Объединение...
                      </>
                    ) : (
                      <>
                        <Merge className="mr-2 h-4 w-4" />
                        Объединить {currentGroup.people.length - 1} дублей
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
