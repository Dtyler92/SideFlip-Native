export function getTutorialContentAccessibilityProps(tutorialActive) {
  return {
    accessibilityElementsHidden: Boolean(tutorialActive),
    importantForAccessibility: tutorialActive ? 'no-hide-descendants' : 'auto',
  }
}