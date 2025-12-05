import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GalleriesManager } from "@/components/admin/galleries-manager"
import { PhotographersManager } from "@/components/admin/photographers-manager"
import { LocationsManager } from "@/components/admin/locations-manager"
import { OrganizersManager } from "@/components/admin/organizers-manager"
import { PeopleManager } from "@/components/admin/people-manager"
import { ServiceManager } from "@/components/admin/service-manager"

const APP_VERSION = "v2.3.2" // Removed save blocking, added KeptFace model typing

export default function AdminPage() {
  return (
    <div className="container mx-auto py-10">
      <div className="mb-8">
        <h1 className="font-serif text-4xl font-bold mb-2">Панель администратора {APP_VERSION}</h1>
        <p className="font-serif text-muted-foreground">Управление галереями, фотографами, локациями и людьми</p>
      </div>

      <Tabs defaultValue="galleries" className="w-full">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="galleries">Галереи</TabsTrigger>
          <TabsTrigger value="photographers">Фотографы</TabsTrigger>
          <TabsTrigger value="locations">Локации</TabsTrigger>
          <TabsTrigger value="organizers">Организаторы</TabsTrigger>
          <TabsTrigger value="people">Люди</TabsTrigger>
          <TabsTrigger value="service">Сервис</TabsTrigger>
        </TabsList>

        <TabsContent value="galleries" className="mt-6">
          <GalleriesManager />
        </TabsContent>

        <TabsContent value="photographers" className="mt-6">
          <PhotographersManager />
        </TabsContent>

        <TabsContent value="locations" className="mt-6">
          <LocationsManager />
        </TabsContent>

        <TabsContent value="organizers" className="mt-6">
          <OrganizersManager />
        </TabsContent>

        <TabsContent value="people" className="mt-6">
          <PeopleManager />
        </TabsContent>

        <TabsContent value="service" className="mt-6">
          <ServiceManager />
        </TabsContent>
      </Tabs>
    </div>
  )
}
