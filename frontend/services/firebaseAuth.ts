import type { FirebaseApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';

// Web: o Firebase guarda a sessão no IndexedDB do browser por defeito
// (a versão para telemóvel está em firebaseAuth.native.ts)
export function criarAuth(app: FirebaseApp): Auth {
  return getAuth(app);
}
