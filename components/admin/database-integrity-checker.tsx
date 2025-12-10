import type React from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "./ui/card" // Assuming a UI library is used
import IssueRow from "./issue-row" // Assuming IssueRow component is imported

interface IntegrityReport {
  photoFaces: {
    verifiedWithoutPerson: number
    verifiedWithWrongConfidence: number
    personWithoutConfidence: number
    nonExistentPerson: number
    nonExistentPhoto: number
    orphanedLinks: number
  }
  people: {
    withoutDescriptors: number
    withoutFaces: number
    duplicateNames: number
  }
  totalIssues: number
  details: Record<string, any[]>
}

const DatabaseIntegrityChecker: React.FC<{ report: IntegrityReport }> = ({ report }) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Проблемы с лицами на фото (Photo Faces)</CardTitle>
        <CardDescription>
          Всего проблем:{" "}
          {report.photoFaces.verifiedWithoutPerson +
            report.photoFaces.verifiedWithWrongConfidence +
            report.photoFaces.personWithoutConfidence +
            report.photoFaces.nonExistentPerson +
            report.photoFaces.nonExistentPhoto +
            (report.photoFaces.orphanedLinks || 0)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Other code here */}
        <IssueRow
          title="Потерянные связи (не видны в галерее игрока)"
          count={report.photoFaces.orphanedLinks || 0}
          issueType="orphanedLinks"
          description="Лица привязаны к игроку, но confidence ниже порога 60% → Автофикс: повышает confidence до 60%"
          severity="high"
          canFix={true}
        />
      </CardContent>
    </Card>
  )
}

export default DatabaseIntegrityChecker
