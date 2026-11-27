import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';

// Telemóvel: o ficheiro escolhido foi copiado para a cache da app (copyToCacheDirectory)
export async function lerFicheiro(ficheiro: DocumentPickerAsset): Promise<Uint8Array> {
  return new File(ficheiro.uri).bytes();
}
