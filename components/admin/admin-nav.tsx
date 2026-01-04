"use client"

/**
 * Admin Navigation Component
 *
 * @migrated 2025-12-27 - Removed direct Supabase browser client
 * @updated 2026-01-03 - Switched to Google OAuth admin auth
 */

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { APP_VERSION } from "@/lib/version"
import {
  Images,
  Users,
  BookOpen,
  BarChart3,
  Settings,
  Wrench,
  LogOut,
  Globe,
  Shield,
  UserCog,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useEffect, useState } from "react"
import { getCitiesAction } from "@/app/admin/actions/entities"
import { useAdminAuth } from "./admin-auth-provider"
import { logout, hasMinRole } from "@/lib/admin-auth"
import { BackendStatusIndicator } from "./backend-status-indicator"

interface City {
  id: string
  name: string
  slug: string
}

const navItems = [
  { href: "/admin/galleries", label: "Галереи", icon: Images },
  { href: "/admin/people", label: "Люди", icon: Users },
  { href: "/admin/directories", label: "Справочники", icon: BookOpen },
  { href: "/admin/statistics", label: "Статистика", icon: BarChart3 },
  { href: "/admin/settings", label: "Настройки", icon: Settings },
  { href: "/admin/service", label: "Сервис", icon: Wrench },
  { href: "/admin/admins", label: "Админы", icon: UserCog, minRole: "global_admin" as const },
]

const ROLE_LABELS: Record<string, string> = {
  owner: "Владелец",
  global_admin: "Глобальный админ",
  local_admin: "Локальный админ",
  moderator: "Модератор",
}

export function AdminNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { admin } = useAdminAuth()
  const [cities, setCities] = useState<City[]>([])
  const [selectedCity, setSelectedCity] = useState<string>("all")

  useEffect(() => {
    const loadCities = async () => {
      const result = await getCitiesAction(true)
      if (result.success && result.data) {
        setCities(result.data)
      }
    }

    const savedCity = document.cookie
      .split("; ")
      .find((row) => row.startsWith("admin_city_filter="))
      ?.split("=")[1]

    if (savedCity) {
      setSelectedCity(savedCity)
    }

    loadCities()
  }, [])

  const handleLogout = () => {
    logout()
    // Use window.location for full page reload (triggers middleware)
    window.location.href = "/admin/login"
  }

  const handleCityChange = (value: string) => {
    setSelectedCity(value)
    // Сохранить в cookie на 30 дней
    document.cookie = `admin_city_filter=${value}; path=/admin; max-age=${30 * 24 * 60 * 60}`
    // Перезагрузить страницу для применения фильтра
    window.location.reload()
  }

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/galleries" className="text-2xl font-bold hover:opacity-80">
            Админ-панель
          </Link>
          <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            {APP_VERSION}
          </span>
          <BackendStatusIndicator />
        </div>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            // Check role requirement
            if (item.minRole && !hasMinRole(admin, item.minRole)) {
              return null
            }

            const Icon = item.icon
            const isActive = pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-3">
          {/* Селектор города */}
          <Select value={selectedCity} onValueChange={handleCityChange}>
            <SelectTrigger className="w-[160px]">
              <Globe className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Все города" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все города</SelectItem>
              {cities.map((city) => (
                <SelectItem key={city.id} value={city.id}>
                  {city.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Меню пользователя */}
          {admin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={admin.avatar_url || undefined} alt={admin.name || admin.email} />
                    <AvatarFallback>
                      {(admin.name || admin.email).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{admin.name || admin.email}</p>
                    <p className="text-xs text-muted-foreground">{admin.email}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Shield className="h-3 w-3" />
                      {ROLE_LABELS[admin.role] || admin.role}
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  Выйти
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </header>
  )
}
