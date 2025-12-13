"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LocationsManager } from "@/components/admin/locations-manager"
import { OrganizersManager } from "@/components/admin/organizers-manager"
import { PhotographersManager } from "@/components/admin/photographers-manager"
import { CitiesManager } from "@/components/admin/cities-manager"
import { MapPin, Users, Camera, Globe } from "lucide-react"

export default function DirectoriesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Справочники</h2>
        <p className="text-muted-foreground">
          Управление справочниками: города, площадки, организаторы, фотографы
        </p>
      </div>

      <Tabs defaultValue="cities" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="cities" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Города
          </TabsTrigger>
          <TabsTrigger value="locations" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Площадки
          </TabsTrigger>
          <TabsTrigger value="organizers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Организаторы
          </TabsTrigger>
          <TabsTrigger value="photographers" className="flex items-center gap-2">
            <Camera className="h-4 w-4" />
            Фотографы
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cities" className="mt-6">
          <CitiesManager />
        </TabsContent>

        <TabsContent value="locations" className="mt-6">
          <LocationsManager />
        </TabsContent>

        <TabsContent value="organizers" className="mt-6">
          <OrganizersManager />
        </TabsContent>

        <TabsContent value="photographers" className="mt-6">
          <PhotographersManager />
        </TabsContent>
      </Tabs>
    </div>
  )
}
