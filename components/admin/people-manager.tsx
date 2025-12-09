import { getPeopleAction } from "@/app/admin/actions/entities"
import { AddPersonDialog } from "./add-person-dialog"
import { PersonList } from "./person-list"
import type { Person } from "@/lib/types"

type PersonWithStats = Person & {
  verified_photos_count: number
  high_confidence_photos_count: number
  descriptor_count: number
}

export async function PeopleManager() {
  const result = await getPeopleAction(true) // with_stats=true
  const peopleWithStats: PersonWithStats[] = result.success ? result.data : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Люди</h2>
          <p className="text-muted-foreground">Управление базой людей для распознавания лиц</p>
        </div>
        <div className="flex gap-2">
          <AddPersonDialog />
        </div>
      </div>
      <PersonList people={peopleWithStats} />
    </div>
  )
}
