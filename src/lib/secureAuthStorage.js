import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import { createSecureAuthStorage } from './secureAuthStorageModel'

export const secureAuthStorage = createSecureAuthStorage({
  secureStore: SecureStore,
  legacyStorage: AsyncStorage,
})
