import { getOrganizersAction } from "@/app/admin/actions/entities"
import { AddOrganizerDialog } from "@/components/admin/add-organizer-dialog"
import { OrganizerList } from "@/components/admin/organizer-list"

export async function OrganizersManager() {
  const result = await getOrganizersAction()
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Организаторы</h2>
        <AddOrganizerDialog />
      </div>
      <OrganizerList organizers={result.success ? result.data : []} />
    </div>
  )
}
