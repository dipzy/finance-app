import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { t } from '../i18n';
import { permitirSaidaTemporaria, terminarSaidaTemporaria } from '../services/bloqueio';
import type { OpcoesPartilha } from './guardarFicheiro';

// A pasta escolhida da primeira vez (normalmente Transferências/Downloads): as seguintes vão para lá
const CHAVE_PASTA = '@financas:pastaDescargas';

// Telemóvel:
//   - "descarregar": grava o ficheiro numa pasta do telemóvel. Da primeira vez o Android pede para
//     escolher a pasta (ex.: Transferências) e a app lembra-se dela;
//   - "partilhar": abre a folha de partilha (Drive, email, WhatsApp...).
// Devolve onde ficou o ficheiro (para a mensagem de sucesso) ou nada quando foi partilhado.
export async function guardarFicheiro(
  bytes: Uint8Array,
  nome: string,
  mimeType: string,
  opcoes: OpcoesPartilha = {}
): Promise<string | void> {
  if (opcoes.modo === 'descarregar' && Platform.OS === 'android') {
    return descarregar(bytes, nome, mimeType);
  }

  const ficheiro = new File(Paths.cache, nome);
  ficheiro.create({ overwrite: true });
  ficheiro.write(bytes);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(t('Partilha de ficheiros não disponível neste dispositivo'));
  }
  // A folha de partilha é uma janela do sistema: não deve bloquear a app ao voltar
  permitirSaidaTemporaria();
  try {
    await Sharing.shareAsync(ficheiro.uri, {
      mimeType,
      dialogTitle: opcoes.titulo ?? t('Partilhar ficheiro'),
      UTI: opcoes.uti,
    });
  } finally {
    terminarSaidaTemporaria();
  }
}

async function descarregar(bytes: Uint8Array, nome: string, mimeType: string): Promise<string> {
  // Primeiro tenta a pasta já escolhida; se deixou de dar (apagada, sem permissão), pede outra
  const guardada = await AsyncStorage.getItem(CHAVE_PASTA).catch(() => null);
  if (guardada) {
    try {
      return escrever(new Directory(guardada), bytes, nome, mimeType);
    } catch {
      await AsyncStorage.removeItem(CHAVE_PASTA).catch(() => undefined);
    }
  }

  permitirSaidaTemporaria();
  let pasta: Directory;
  try {
    pasta = new Directory((await Directory.pickDirectoryAsync()).uri);
  } finally {
    terminarSaidaTemporaria();
  }
  await AsyncStorage.setItem(CHAVE_PASTA, pasta.uri).catch(() => undefined);
  return escrever(pasta, bytes, nome, mimeType);
}

function escrever(pasta: Directory, bytes: Uint8Array, nome: string, mimeType: string): string {
  const ficheiro = pasta.createFile(nome, mimeType);
  ficheiro.write(bytes);
  return nomeDaPasta(pasta.uri);
}

// "content://.../tree/primary%3ADownload" -> "Download"
function nomeDaPasta(uri: string): string {
  const parte = decodeURIComponent(uri.split('/').pop() ?? '');
  return parte.split(':').pop() || t('a pasta escolhida');
}

/** No telemóvel há sempre a folha de partilha. */
export function podePartilhar(): boolean {
  return true;
}
