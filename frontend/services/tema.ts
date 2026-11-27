import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance, DevSettings, Platform } from 'react-native';
import { CHAVE_TEMA_WEB, esquemaDoSistema, type PreferenciaTema, resolverEsquema } from '../constants/esquema';
import { esquemaAplicado } from '../constants/tema';
import { guardarDefinicoes, obterDefinicoes } from './definicoes';

// Aparência (Sistema / Claro / Escuro). As cores são criadas uma vez ao arrancar (constants/tema.ts),
// por isso mudar de tema reinicia a app (um segundo). A escolha fica nas definições do dispositivo e, na
// web, também no localStorage (para a ler antes de desenhar o primeiro ecrã).

const CHAVE_REINICIO = '@financas:tema-reinicio';
// Dois reinícios seguidos em menos de 30 s: algo correu mal, não ficar em ciclo
const JANELA_REINICIO_MS = 30_000;

export const acoesTema = {
  /** Volta a abrir a app para as cores novas valerem (web: recarrega a página). */
  async reiniciarApp(): Promise<void> {
    if (Platform.OS === 'web') {
      window.location.reload();
      return;
    }
    if (__DEV__) {
      DevSettings.reload();
      return;
    }
    const Updates = require('expo-updates') as typeof import('expo-updates');
    await Updates.reloadAsync();
  },
};

/** Diz ao sistema qual é o esquema da app (telemóvel): 'unspecified' volta a seguir o telemóvel. */
function aplicarNoSistema(preferencia: PreferenciaTema) {
  if (Platform.OS === 'web' || typeof Appearance.setColorScheme !== 'function') return;
  try {
    Appearance.setColorScheme(preferencia === 'sistema' ? 'unspecified' : preferencia === 'claro' ? 'light' : 'dark');
  } catch (erro) {
    console.error('Erro ao aplicar o tema:', erro);
  }
}

function guardarNaWeb(preferencia: PreferenciaTema) {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(CHAVE_TEMA_WEB, preferencia);
  } catch {
    // sem localStorage (janela privada): a escolha vale só nas definições
  }
}

// O esquema que passa a valer com esta preferência (lido depois de a aplicar no sistema)
function esquemaDaPreferencia(preferencia: PreferenciaTema) {
  // No telemóvel o Appearance já tem o override; na web 'claro'/'escuro' vêm da preferência
  return resolverEsquema(preferencia, esquemaDoSistema());
}

/** Muda a aparência: guarda, aplica e reinicia a app se as cores forem outras. Devolve se reiniciou. */
export async function mudarTema(preferencia: PreferenciaTema): Promise<boolean> {
  await guardarDefinicoes({ tema: preferencia });
  guardarNaWeb(preferencia);
  aplicarNoSistema(preferencia);
  if (esquemaDaPreferencia(preferencia) === esquemaAplicado) return false;
  await acoesTema.reiniciarApp();
  return true;
}

/**
 * Ao abrir a app: aplica a aparência guardada. Se as cores com que a app arrancou (as do sistema) não
 * forem as da escolha, reinicia uma vez. Devolve true se está a reiniciar (não desenhar nada).
 */
export async function sincronizarTemaNoArranque(agora = Date.now()): Promise<boolean> {
  try {
    const { tema } = await obterDefinicoes();
    guardarNaWeb(tema);
    aplicarNoSistema(tema);
    if (esquemaDaPreferencia(tema) === esquemaAplicado) return false;

    const ultimo = Number(await AsyncStorage.getItem(CHAVE_REINICIO));
    if (ultimo && agora - ultimo < JANELA_REINICIO_MS) return false;
    await AsyncStorage.setItem(CHAVE_REINICIO, String(agora));
    await acoesTema.reiniciarApp();
    return true;
  } catch (erro) {
    console.error('Erro ao sincronizar o tema:', erro);
    return false;
  }
}
