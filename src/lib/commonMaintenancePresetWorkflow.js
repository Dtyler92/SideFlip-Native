import { activeDefinitionMatchesPreset } from '../domain/myStuff/commonMaintenancePresets.js'

function findActiveDuplicate(definitions, preset) {
  return (Array.isArray(definitions) ? definitions : []).some(definition => activeDefinitionMatchesPreset(definition,preset))
}

export async function addCommonMaintenancePresets({ presets, readDefinitions, createDefinition, mutationIdForPreset, onConfirmed }) {
  const created=[]
  const skipped=[]
  let definitions=await readDefinitions()

  for (const preset of presets) {
    if (findActiveDuplicate(definitions,preset)) {
      skipped.push(preset.id)
      onConfirmed?.(preset)
      continue
    }

    const mutationId=mutationIdForPreset(preset)
    let createError=null
    try {
      await createDefinition(preset,mutationId)
    } catch (error) {
      createError=error
    }

    definitions=await readDefinitions()
    if (!findActiveDuplicate(definitions,preset)) {
      if (createError) throw createError
      throw new Error(`${preset.name} was not found after saving. Try again with the same selection.`)
    }
    created.push(preset.id)
    onConfirmed?.(preset)
  }

  return {created,skipped}
}
