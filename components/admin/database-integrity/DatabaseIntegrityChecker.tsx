"use client"

/**
 * Database Integrity Checker Component
 * 
 * Рефакторинг: 785 строк → 10 модулей
 * @migrated 2025-12-27 - Removed direct Supabase browser client
 * @refactored 2025-12-29 - Split into modular components
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FaceTaggingDialog } from "@/components/admin/face-tagging-dialog"
import { DuplicatePeopleDialog } from "@/components/admin/duplicate-people-dialog"

import { useIntegrityChecker } from "./hooks"
import {
  IntegrityRunControls,
  IntegritySummary,
  IntegrityIssueRow,
  PeopleWithoutFacesRow,
} from "./components"

export function DatabaseIntegrityChecker() {
  const {
    isChecking,
    report,
    fixingIssue,
    expandedIssues,
    processingFaces,
    removedFaces,
    confidenceThreshold,
    taggingDialogOpen,
    selectedPhotoForTagging,
    duplicateDialogOpen,
    handleCheck,
    handleFix,
    toggleIssueExpanded,
    handleConfirmFace,
    handleRejectFace,
    handleTaggingDialogClose,
    handleTaggingSave,
    handleDuplicateDialogClose,
    openDuplicateDialog,
  } = useIntegrityChecker()

  return (
    <div className="space-y-6">
      <IntegrityRunControls
        isChecking={isChecking}
        onCheck={handleCheck}
        report={report}
      />

      {report && (
        <>
          <IntegritySummary
            stats={report.stats}
            checksPerformed={report.checksPerformed}
          />

          {/* Проблемы с лицами на фото */}
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
              <div className="space-y-2">
                <IntegrityIssueRow
                  title="Верифицированные лица без игрока"
                  count={report.photoFaces.verifiedWithoutPerson}
                  issueType="verifiedWithoutPerson"
                  description="Verified=True, но person_id=null. Исправить → на всех лицах удалить Verified"
                  severity="critical"
                  canFix={true}
                  checked={report.photoFaces.verifiedWithoutPerson === 0}
                  hasActions={true}
                  maxItems={30}
                  details={report.details?.verifiedWithoutPerson || []}
                  isExpanded={expandedIssues.has("verifiedWithoutPerson")}
                  onToggleExpand={() => toggleIssueExpanded("verifiedWithoutPerson")}
                  onFix={() => handleFix("verifiedWithoutPerson")}
                  isFixing={fixingIssue === "verifiedWithoutPerson"}
                  fixingDisabled={fixingIssue !== null}
                  onConfirmFace={handleConfirmFace}
                  onRejectFace={handleRejectFace}
                  processingFaces={processingFaces}
                  removedFaces={removedFaces}
                  confidenceThreshold={confidenceThreshold}
                />

                <IntegrityIssueRow
                  title="Потерянные связи (не видны в галерее игрока)"
                  count={report.photoFaces.orphanedLinks || 0}
                  issueType="orphanedLinks"
                  description={`Привязаны к игроку, но confidence < ${Math.round(confidenceThreshold * 100)}%`}
                  severity="high"
                  canFix={true}
                  checked={(report.photoFaces.orphanedLinks || 0) === 0}
                  showConfidence={true}
                  showVerified={true}
                  hasActions={true}
                  maxItems={30}
                  details={report.details?.orphanedLinks || []}
                  isExpanded={expandedIssues.has("orphanedLinks")}
                  onToggleExpand={() => toggleIssueExpanded("orphanedLinks")}
                  onFix={() => handleFix("orphanedLinks")}
                  isFixing={fixingIssue === "orphanedLinks"}
                  fixingDisabled={fixingIssue !== null}
                  onConfirmFace={handleConfirmFace}
                  onRejectFace={handleRejectFace}
                  processingFaces={processingFaces}
                  removedFaces={removedFaces}
                  confidenceThreshold={confidenceThreshold}
                />

                <IntegrityIssueRow
                  title="Лица с игроком без confidence"
                  count={report.photoFaces.personWithoutConfidence}
                  issueType="personWithoutConfidence"
                  description="Лица с person_id, но confidence = null → Автофикс: устанавливает confidence=0.5"
                  severity="medium"
                  canFix={true}
                  checked={report.photoFaces.personWithoutConfidence === 0}
                  details={report.details?.personWithoutConfidence || []}
                  isExpanded={expandedIssues.has("personWithoutConfidence")}
                  onToggleExpand={() => toggleIssueExpanded("personWithoutConfidence")}
                  onFix={() => handleFix("personWithoutConfidence")}
                  isFixing={fixingIssue === "personWithoutConfidence"}
                  fixingDisabled={fixingIssue !== null}
                  onConfirmFace={handleConfirmFace}
                  onRejectFace={handleRejectFace}
                  processingFaces={processingFaces}
                  removedFaces={removedFaces}
                  confidenceThreshold={confidenceThreshold}
                />

                <IntegrityIssueRow
                  title="Лица с несуществующим игроком"
                  count={report.photoFaces.nonExistentPerson}
                  issueType="nonExistentPersonFaces"
                  description="person_id ссылается на удаленного игрока → Автофикс: обнуляет person_id"
                  severity="critical"
                  canFix={true}
                  checked={report.photoFaces.nonExistentPerson === 0}
                  details={report.details?.nonExistentPersonFaces || []}
                  isExpanded={expandedIssues.has("nonExistentPersonFaces")}
                  onToggleExpand={() => toggleIssueExpanded("nonExistentPersonFaces")}
                  onFix={() => handleFix("nonExistentPersonFaces")}
                  isFixing={fixingIssue === "nonExistentPersonFaces"}
                  fixingDisabled={fixingIssue !== null}
                  onConfirmFace={handleConfirmFace}
                  onRejectFace={handleRejectFace}
                  processingFaces={processingFaces}
                  removedFaces={removedFaces}
                  confidenceThreshold={confidenceThreshold}
                />

                <IntegrityIssueRow
                  title="Лица с несуществующим фото"
                  count={report.photoFaces.nonExistentPhoto}
                  issueType="nonExistentPhotoFaces"
                  description="photo_id ссылается на удаленное фото → Автофикс: удаляет запись"
                  severity="critical"
                  canFix={true}
                  checked={report.photoFaces.nonExistentPhoto === 0}
                  details={report.details?.nonExistentPhotoFaces || []}
                  isExpanded={expandedIssues.has("nonExistentPhotoFaces")}
                  onToggleExpand={() => toggleIssueExpanded("nonExistentPhotoFaces")}
                  onFix={() => handleFix("nonExistentPhotoFaces")}
                  isFixing={fixingIssue === "nonExistentPhotoFaces"}
                  fixingDisabled={fixingIssue !== null}
                  onConfirmFace={handleConfirmFace}
                  onRejectFace={handleRejectFace}
                  processingFaces={processingFaces}
                  removedFaces={removedFaces}
                  confidenceThreshold={confidenceThreshold}
                />

                <IntegrityIssueRow
                  title="Нераспознанные лица"
                  count={report.photoFaces.unrecognizedFaces || 0}
                  issueType="unrecognizedFaces"
                  description="Лица с дескриптором, но без привязки к игроку. Это нормально — ожидают распознавания или ручного тегирования"
                  severity="low"
                  canFix={false}
                  infoOnly={true}
                  details={[]}
                  isExpanded={false}
                  onToggleExpand={() => {}}
                  onFix={() => {}}
                  isFixing={false}
                  fixingDisabled={true}
                  onConfirmFace={handleConfirmFace}
                  onRejectFace={handleRejectFace}
                  processingFaces={processingFaces}
                  removedFaces={removedFaces}
                  confidenceThreshold={confidenceThreshold}
                />
              </div>
            </CardContent>
          </Card>

          {/* Информация об игроках */}
          <Card>
            <CardHeader>
              <CardTitle>Информация об игроках (People)</CardTitle>
              <CardDescription>
                Найдено групп дубликатов: {report.people.duplicatePeople}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <IntegrityIssueRow
                  title="Дубликаты игроков"
                  count={report.people.duplicatePeople}
                  issueType="duplicatePeople"
                  description="Игроки с совпадающими контактами (Gmail, Telegram, Facebook, Instagram)"
                  severity="high"
                  canFix={false}
                  checked={report.people.duplicatePeople === 0}
                  customDetailsButton={report.people.duplicatePeople > 0}
                  onCustomDetails={openDuplicateDialog}
                  details={[]}
                  isExpanded={false}
                  onToggleExpand={() => {}}
                  onFix={() => {}}
                  isFixing={false}
                  fixingDisabled={true}
                  onConfirmFace={handleConfirmFace}
                  onRejectFace={handleRejectFace}
                  processingFaces={processingFaces}
                  removedFaces={removedFaces}
                  confidenceThreshold={confidenceThreshold}
                />

                <PeopleWithoutFacesRow
                  names={report.details?.peopleWithoutFaces || []}
                  count={report.people?.withoutFaces || 0}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Диалоги */}
      {selectedPhotoForTagging && (
        <FaceTaggingDialog
          imageId={selectedPhotoForTagging.imageId}
          imageUrl={selectedPhotoForTagging.imageUrl}
          open={taggingDialogOpen}
          onOpenChange={handleTaggingDialogClose}
          onSave={handleTaggingSave}
        />
      )}
      
      <DuplicatePeopleDialog
        open={duplicateDialogOpen}
        onOpenChange={handleDuplicateDialogClose}
      />
    </div>
  )
}
