import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveProjectNotesSaveResponse } from '../src/screens/projectNotesModel.js'

test('current Project notes response updates both persisted Project state and unchanged draft', () => {
  assert.deepEqual(resolveProjectNotesSaveResponse({
    targetProjectId:'project-a', currentProjectId:'project-a',
    saveRequest:3, currentSaveRequest:3,
    savedEditVersion:4, currentEditVersion:4,
  }), { applyProject:true, replaceDraft:true })
})

test('edits made during a notes save remain in the draft', () => {
  assert.deepEqual(resolveProjectNotesSaveResponse({
    targetProjectId:'project-a', currentProjectId:'project-a',
    saveRequest:3, currentSaveRequest:3,
    savedEditVersion:4, currentEditVersion:5,
  }), { applyProject:true, replaceDraft:false })
})

test('stale responses from a prior Project are ignored even after route reuse', () => {
  assert.deepEqual(resolveProjectNotesSaveResponse({
    targetProjectId:'project-a', currentProjectId:'project-a',
    saveRequest:3, currentSaveRequest:6,
    savedEditVersion:4, currentEditVersion:4,
  }), { applyProject:false, replaceDraft:false })
  assert.deepEqual(resolveProjectNotesSaveResponse({
    targetProjectId:'project-a', currentProjectId:'project-b',
    saveRequest:3, currentSaveRequest:3,
    savedEditVersion:4, currentEditVersion:4,
  }), { applyProject:false, replaceDraft:false })
})
