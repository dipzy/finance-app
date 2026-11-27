import { getApp, getApps, initializeApp } from 'firebase/app';
import { Firestore, getFirestore, initializeFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';
import { MODO_E2E } from '../utils/e2e';
import { criarAuth } from './firebaseAuth';

// Valores em .env (ver .env.example). A config web do Firebase não é secreta:
// quem controla o acesso aos dados são as regras em firestore.rules
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Testes E2E: o Firebase não é usado (login e API passam pelo modo E2E), basta uma configuração de mentira
if (MODO_E2E) {
  firebaseConfig.apiKey = firebaseConfig.apiKey || 'e2e';
  firebaseConfig.projectId = firebaseConfig.projectId || 'e2e';
}

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error(
    'Firebase não configurado: copia .env.example para .env e preenche com os valores da consola Firebase.'
  );
}

// getApps evita inicializar duas vezes quando o Fast Refresh volta a correr este módulo
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function criarFirestore(): Firestore {
  try {
    return initializeFirestore(app, {
      // Campos opcionais (ex.: data nas despesas fixas) podem vir undefined
      ignoreUndefinedProperties: true,
      // No React Native o streaming do Firestore nem sempre funciona; long polling é mais fiável
      experimentalForceLongPolling: Platform.OS !== 'web',
    });
  } catch {
    // Já inicializado (Fast Refresh)
    return getFirestore(app);
  }
}

export const auth = criarAuth(app);
export const db = criarFirestore();
