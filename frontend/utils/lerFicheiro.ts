import type { DocumentPickerAsset } from 'expo-document-picker';

// Web: o browser dá o ficheiro escolhido como File
// (a versão para telemóvel está em lerFicheiro.native.ts)
export async function lerFicheiro(ficheiro: DocumentPickerAsset): Promise<Uint8Array> {
  const blob: Blob = ficheiro.file ?? (await (await fetch(ficheiro.uri)).blob());
  return new Uint8Array(await blob.arrayBuffer());
}
