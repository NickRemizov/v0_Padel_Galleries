import { getPhotographersAction } from "@/app/admin/actions/entities"
import { AddPhotographerDialog } from "@/components/admin/add-photographer-dialog"
import { PhotographerList } from "@/components/admin/photographer-list"

export async function PhotographersManager() {
  const result = await getPhotographersAction()
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Фотографы</h2>
        <AddPhotographerDialog />
      </div>
      <PhotographerList photographers={result.success ? result.data : []} />
    </div>
  )
}
