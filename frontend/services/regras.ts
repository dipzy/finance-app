import { t } from '../i18n';
import { api, ErroApi, parte } from './api';
import type { Categoria, SugestaoCategoria } from './tipos';

// Regras de categorização (GET/POST/PUT/DELETE /api/regras-categoria): "se a descrição contiver este
// texto (sem maiúsculas nem acentos), a categoria é esta". Quem decide é a API: aqui só se
// listam e editam. As regras do utilizador ganham às padrão (as que vêm com a app, só de leitura);
// entre as do utilizador ganha a de maior prioridade. Ao importar do Excel e ao registar gastos sem
// categoria a API aplica-as sozinha: a app nunca manda uma categoria por cima.

export interface RegraCategoria {
  id: string;
  texto: string;
  categoria: Categoria;
  ativa: boolean;
  prioridade: number;
}

export interface RegraPadrao {
  texto: string;
  categoria: Categoria;
}

export interface NovaRegra {
  texto: string;
  categoria: Categoria;
  ativa?: boolean;
  prioridade?: number;
}

// A API aceita prioridades de -1000 a 1000
export const PRIORIDADE_MINIMA = -1000;
export const PRIORIDADE_MAXIMA = 1000;

export const RegrasDB = {
  listar(): Promise<RegraCategoria[]> {
    return api.get<RegraCategoria[]>('/api/regras-categoria');
  },
  criar(regra: NovaRegra): Promise<{ id: string }> {
    return api.post<{ id: string }>('/api/regras-categoria', regra);
  },
  alterar(id: string, regra: NovaRegra): Promise<void> {
    return api.put(`/api/regras-categoria/${parte(id)}`, regra);
  },
  remover(id: string): Promise<void> {
    return api.delete(`/api/regras-categoria/${parte(id)}`);
  },
  padrao(): Promise<RegraPadrao[]> {
    return api.get<RegraPadrao[]>('/api/regras-categoria/padrao');
  },
  sugerir(descricao: string): Promise<SugestaoCategoria> {
    return api.get<SugestaoCategoria>(`/api/regras-categoria/sugerir?descricao=${parte(descricao.trim())}`);
  },
};

/** O texto da regra que decidiu uma sugestão (a API pode mandá-lo como texto ou dentro de um objeto). */
export function textoDaRegra(regra: SugestaoCategoria['regra']): string | undefined {
  const texto = typeof regra === 'string' ? regra : regra?.texto;
  return texto?.trim() || undefined;
}

/** "Regra: Continente" quando a categoria sugerida veio de uma regra; senão nada. */
export function textoOrigemSugestao(sugestao: Pick<SugestaoCategoria, 'origem' | 'regra'> | null | undefined): string | undefined {
  if (!sugestao || (sugestao.origem !== 'regra' && sugestao.origem !== 'regra-padrao')) return undefined;
  const texto = textoDaRegra(sugestao.regra);
  return texto ? t('Regra: {texto}', { texto }) : undefined;
}

/** Mensagem para uma falha ao guardar uma regra (409 = já existe uma com este texto). */
export function mensagemDeRegra(erro: unknown): string {
  if (erro instanceof ErroApi && erro.estado === 409) return t('Já tens uma regra com este texto.');
  if (erro instanceof ErroApi && erro.estado === 400) return erro.message;
  return erro instanceof ErroApi ? erro.message : t('Não foi possível guardar a regra.');
}

/** As regras por ordem de utilização: ativas primeiro, maior prioridade primeiro, depois por texto. */
export function ordenarRegras(regras: RegraCategoria[]): RegraCategoria[] {
  return [...regras].sort(
    (a, b) =>
      Number(b.ativa) - Number(a.ativa) ||
      b.prioridade - a.prioridade ||
      a.texto.localeCompare(b.texto, 'pt', { sensitivity: 'base' })
  );
}

/** Lê a prioridade escrita (vazio = 0); null se não for um número inteiro dentro dos limites. */
export function lerPrioridade(texto: string): number | null {
  const limpo = texto.trim();
  if (limpo === '') return 0;
  if (!/^-?\d+$/.test(limpo)) return null;
  const valor = Number(limpo);
  return valor >= PRIORIDADE_MINIMA && valor <= PRIORIDADE_MAXIMA ? valor : null;
}

/** O texto sem maiúsculas nem acentos (como a API o compara). */
export function normalizarTexto(texto: string): string {
  return texto
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Já existe uma regra do utilizador com este texto? */
export function jaExiste(regras: RegraCategoria[], texto: string, ignorarId?: string): boolean {
  const alvo = normalizarTexto(texto);
  return regras.some((r) => r.id !== ignorarId && normalizarTexto(r.texto) === alvo);
}
