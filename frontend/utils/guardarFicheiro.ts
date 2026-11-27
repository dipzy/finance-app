import { t } from '../i18n';

export interface OpcoesPartilha {
  // "descarregar" (por defeito): guardar o ficheiro; "partilhar": enviar para outra app
  modo?: 'descarregar' | 'partilhar';
  // Só usados no telemóvel (folha de partilha)
  titulo?: string;
  uti?: string;
}

// Web: descarregar o ficheiro pelo browser; "partilhar" usa a partilha do sistema quando o browser a
// tem (telemóveis) e senão descarrega (a versão para telemóvel está em guardarFicheiro.native.ts)
export async function guardarFicheiro(
  bytes: Uint8Array,
  nome: string,
  mimeType: string,
  opcoes: OpcoesPartilha = {}
): Promise<string | void> {
  const blob = new Blob([bytes as BlobPart], { type: mimeType });

  if (opcoes.modo === 'partilhar' && typeof navigator !== 'undefined' && navigator.canShare) {
    const ficheiro = new File([blob], nome, { type: mimeType });
    if (navigator.canShare({ files: [ficheiro] })) {
      try {
        await navigator.share({ files: [ficheiro], title: opcoes.titulo });
        return;
      } catch (erro) {
        // Cancelado pelo utilizador: não é um erro
        if (erro instanceof Error && erro.name === 'AbortError') return;
        throw erro;
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  // Revogar logo a seguir ao click pode cancelar o download em alguns browsers
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return t('Transferências');
}

/** Na web só há "Enviar" quando o browser consegue partilhar ficheiros (telemóveis). */
export function podePartilhar(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
}
