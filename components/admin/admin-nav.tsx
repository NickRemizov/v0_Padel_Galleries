"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
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
  Globe
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"

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
]

export function AdminNav() {
  const pathname = usePathname()
  const [cities, setCities] = useState<City[]>([])
  const [selectedCity, setSelectedCity] = useState<string>("all")

  useEffect(() => {
    const loadCities = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("cities")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("name")
      
      if (data) {
        setCities(data)
      }
    }

    // Загрузить сохранённый город из cookie
    const savedCity = document.cookie
      .split("; ")
      .find((row) => row.startsWith("admin_city_filter="))
      ?.split("=")[1]
    
    if (savedCity) {
      setSelectedCity(savedCity)
    }

    loadCities()
  }, [])

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
        </div>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
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

          {/* Кнопка выхода */}
          <form action="/admin/auth/signout" method="POST">
            <Button variant="outline" size="sm" type="submit">
              <LogOut className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Выйти</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  )
}
