import { AdminNav } from "@/components/admin/admin-nav"
import { AdminAuthProvider } from "@/components/admin/admin-auth-provider"

export const dynamic = "force-dynamic"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AdminAuthProvider>
      <div className="min-h-screen bg-background">
        <AdminNav />
        <main className="container mx-auto px-4 py-8">
          {children}
        </main>
      </div>
    </AdminAuthProvider>
  )
}
