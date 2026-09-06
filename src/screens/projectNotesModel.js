export function resolveProjectNotesSaveResponse({
  targetProjectId,
  currentProjectId,
  saveRequest,
  currentSaveRequest,
  savedEditVersion,
  currentEditVersion,
} = {}) {
  const applyProject = targetProjectId === currentProjectId && saveRequest === currentSaveRequest
  return {
    applyProject,
    replaceDraft: applyProject && savedEditVersion === currentEditVersion,
  }
}
