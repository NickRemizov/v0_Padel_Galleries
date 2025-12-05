"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GalleriesManager } from "@/components/admin/galleries-manager"
import { PhotographersManager } from "@/components/admin/photographers-manager"
import { LocationsManager } from "@/components/admin/locations-manager"
import { OrganizersManager } from "@/components/admin/organizers-manager"
import { PeopleManager } from "@/components/admin/people-manager"
import { ServiceManager } from "@/components/admin/service-manager"

const APP_VERSION = "v2.3.3" // Fixed KeptFace attribute access in batch-verify (f.id instead of f["id"])

export default function AdminPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 font-serif">Панель администратора {APP_VERSION}</h1>
        <p className="text-muted-foreground">Управление галереями, фотографами, локациями и людьми</p>
      </div>

      <Tabs defaultValue="galleries" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="galleries">Галереи</TabsTrigger>
          <TabsTrigger value="photographers">Фотографы</TabsTrigger>
          <TabsTrigger value="locations">Локации</TabsTrigger>
          <TabsTrigger value="organizers">Организаторы</TabsTrigger>
          <TabsTrigger value="people">Люди</TabsTrigger>
          <TabsTrigger value="service">Сервис</TabsTrigger>
        </TabsList>

        <TabsContent value="galleries">
          <GalleriesManager />
        </TabsContent>

        <TabsContent value="photographers">
          <PhotographersManager />
        </TabsContent>

        <TabsContent value="locations">
          <LocationsManager />
        </TabsContent>

        <TabsContent value="organizers">
          <OrganizersManager />
        </TabsContent>

        <TabsContent value="people">
          <PeopleManager />
        </TabsContent>

        <TabsContent value="service">
          <ServiceManager />
        </TabsContent>
      </Tabs>
    </div>
  )
}
