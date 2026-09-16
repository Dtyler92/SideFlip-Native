import AsyncStorage from '@react-native-async-storage/async-storage'
import { completeTutorialIn, hasCompletedTutorialIn } from './tutorialModel'

export async function hasCompletedTutorial() {
  return hasCompletedTutorialIn(AsyncStorage)
}

export async function completeTutorial() {
  await completeTutorialIn(AsyncStorage)
}
