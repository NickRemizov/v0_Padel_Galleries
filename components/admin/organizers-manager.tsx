import { createClient } from "@/lib/supabase/server"
import { AddOrganizerDialog } from "@/components/admin/add-organizer-dialog"
import { OrganizerList } from "@/components/admin/organizer-list"

export async function OrganizersManager() {
  const supabase = await createClient()

  const { data: organizers } = await supabase.from("organizers").select("*").order("name")

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Управление организаторами</h2>
          <p className="text-sm text-muted-foreground">Добавляйте, редактируйте и удаляйте организаторов</p>
        </div>
        <AddOrganizerDialog />
      </div>

      <OrganizerList organizers={organizers || []} />
    </div>
  )
}
