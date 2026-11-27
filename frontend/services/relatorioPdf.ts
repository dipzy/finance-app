import { guardarFicheiro, OpcoesPartilha } from '../utils/guardarFicheiro';
import { ErroApi, parte, pedirBytes } from './api';
import { t } from '../i18n';
import type { Mes } from './tipos';

export const MIME_PDF = 'application/pdf';

/** O nome do ficheiro do relatório de um mês: financas-AAAA-MM.pdf. */
export const nomeRelatorioPdf = (mes: Mes) => `financas-${mes}.pdf`;

/**
 * O relatório do mês em PDF, gerado pela API (GET /api/relatorios/mes/{mes}.pdf): na web descarrega
 * (modo "descarregar") ou envia-o para outra app ("partilhar"). Devolve onde ficou guardado.
 * Erros: ErroApi com a mensagem para mostrar.
 */
export async function exportarRelatorioPdf(mes: Mes, modo: OpcoesPartilha['modo'] = 'descarregar'): Promise<string | void> {
  const bytes = await pedirBytes(`/api/relatorios/mes/${parte(mes)}.pdf`, MIME_PDF);
  return guardarFicheiro(bytes, nomeRelatorioPdf(mes), MIME_PDF, {
    modo,
    titulo: t('Exportar PDF'),
    uti: 'com.adobe.pdf',
  });
}

/** A mensagem do alerta quando a exportação falha (com o motivo, quando vem da API). */
export function mensagemErroPdf(erro: unknown): string {
  const base = t('Não foi possível exportar o PDF.');
  return erro instanceof ErroApi ? `${base} ${erro.message}` : base;
}
