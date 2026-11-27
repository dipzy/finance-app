import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FirebaseApp } from 'firebase/app';
import { Auth, getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import type { Persistence, ReactNativeAsyncStorage } from 'firebase/auth';

// getReactNativePersistence existe na versão React Native do Firebase Auth (que o Metro usa),
// mas os tipos publicados em "firebase/auth" só descrevem a versão web
declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}

// Telemóvel: a sessão tem de ser guardada explicitamente no AsyncStorage,
// senão é preciso fazer login sempre que se abre a app
export function criarAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Já inicializado (Fast Refresh)
    return getAuth(app);
  }
}
