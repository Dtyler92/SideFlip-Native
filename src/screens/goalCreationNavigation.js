import { Alert } from 'react-native'
import { canCreateAnotherGoal } from './tradeUpGoalModel'

export function openGoalCreation({ navigation, plan, activeGoals, onCreated }) {
  if (!canCreateAnotherGoal(plan, activeGoals)) {
    Alert.alert(
      'SideFlip Pro',
      'Free includes one active Trade-Up Goal. Upgrade to SideFlip Pro to create additional active goals.',
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'View Pro', onPress: () => navigation.navigate('Pro') },
      ],
    )
    return false
  }
  navigation.navigate('GoalCreate', { onCreated })
  return true
}
