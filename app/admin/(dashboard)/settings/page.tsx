import { FaceTrainingManager } from "@/components/admin/face-training-manager"
import { WelcomeEditor } from "@/components/admin/welcome-editor"

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <WelcomeEditor />
      <FaceTrainingManager />
    </div>
  )
}
