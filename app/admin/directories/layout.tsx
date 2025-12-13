"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { MapPin, Users, Camera, Globe } from "lucide-react"

const tabs = [
  { href: "/admin/directories/cities", label: "Города", icon: Globe },
  { href: "/admin/directories/locations", label: "Площадки", icon: MapPin },
  { href: "/admin/directories/organizers", label: "Организаторы", icon: Users },
  { href: "/admin/directories/photographers", label: "Фотографы", icon: Camera },
]

export default function DirectoriesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Справочники</h2>
        <p className="text-muted-foreground">
          Управление справочниками: города, площадки, организаторы, фотографы
        </p>
      </div>

      <div className="border-b">
        <nav className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = pathname === tab.href
            
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      <div>{children}</div>
    </div>
  )
}
