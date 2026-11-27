import { api } from './api';
import { GruposDB } from './grupos';
import { t } from '../i18n';

// Histórico de alterações (GET /api/alteracoes): cada criação, alteração ou remoção dos dados,
// registada pela API. Guarda-se um ano. Inclui os grupos: o grupo e as participações, as despesas
// partilhadas, os acertos, as poupanças partilhadas e os seus movimentos.

export type AcaoAlteracao = 'criada' | 'alterada' | 'apagada';

export interface RegistoAlteracao {
  id: string;
  entidade: string; // ex.: "DespesaFixa"
  entidadeId: string;
  descricao?: string; // o título nesse momento
  acao: AcaoAlteracao;
  quando: string; // ISO, UTC
  alteracoes?: Record<string, { de?: unknown; para?: unknown }>;
  origem?: string; // "PATCH /api/..." ou "sistema"
}

export interface PaginaAlteracoes {
  total: number;
  pagina: number;
  tamanho: number;
  itens: RegistoAlteracao[];
}

// Nome de cada tipo de dados, com o artigo ("a despesa fixa", "o orçamento")
const ENTIDADES: Record<string, { nome: string; feminino: boolean }> = {
  DespesaFixa: { nome: 'despesa fixa', feminino: true },
  DespesaExtra: { nome: 'gasto', feminino: false },
  PagamentoFixa: { nome: 'pagamento', feminino: false },
  Poupanca: { nome: 'poupança', feminino: true },
  Divida: { nome: 'dívida', feminino: true },
  Orcamento: { nome: 'orçamento', feminino: false },
  ObjetivoPoupanca: { nome: 'objetivo', feminino: false },
  GastoRecorrente: { nome: 'gasto que se repete', feminino: false },
  RegraCategoria: { nome: 'regra de categorização', feminino: true },
  // Grupos e partilha
  Grupo: { nome: 'grupo', feminino: false },
  GrupoMembro: { nome: 'participação num grupo', feminino: true },
  DespesaPartilhada: { nome: 'despesa partilhada', feminino: true },
  AcertoPartilhado: { nome: 'acerto', feminino: false },
  PoupancaPartilhada: { nome: 'poupança partilhada', feminino: true },
  PoupancaPartilhadaMembro: { nome: 'contribuição na poupança partilhada', feminino: true },
  MovimentoPoupancaPartilhada: { nome: 'movimento da poupança partilhada', feminino: false },
};

// ---- Filtros ----
// A API filtra por um só tipo de cada vez: os filtros que juntam vários fazem um pedido por tipo e
// juntam os resultados por data (listarFiltrado).

export interface FiltroAlteracoes {
  chave: string;
  rotulo: string; // chave do dicionário
  entidades: string[]; // vazio = tudo
}

export const FILTROS_ALTERACOES: FiltroAlteracoes[] = [
  { chave: 'tudo', rotulo: 'Tudo', entidades: [] },
  { chave: 'gastos', rotulo: 'Gastos', entidades: ['DespesaExtra', 'GastoRecorrente'] },
  { chave: 'compromissos', rotulo: 'Compromissos', entidades: ['DespesaFixa', 'PagamentoFixa', 'Divida'] },
  { chave: 'planeamento', rotulo: 'Planeamento', entidades: ['Orcamento', 'ObjetivoPoupanca', 'Poupanca', 'RegraCategoria'] },
  { chave: 'grupos', rotulo: 'Grupos', entidades: ['Grupo', 'GrupoMembro'] },
  { chave: 'partilhadas', rotulo: 'Despesas partilhadas', entidades: ['DespesaPartilhada', 'AcertoPartilhado'] },
  {
    chave: 'mealheiros',
    rotulo: 'Poupança partilhada',
    entidades: ['PoupancaPartilhada', 'PoupancaPartilhadaMembro', 'MovimentoPoupancaPartilhada'],
  },
];

const VERBOS: Record<AcaoAlteracao, string> = { criada: 'Criaste', alterada: 'Alteraste', apagada: 'Apagaste' };
const VERBOS_SISTEMA: Record<AcaoAlteracao, string> = { criada: 'Criado', alterada: 'Alterado', apagada: 'Apagado' };

// Nomes dos campos para os detalhes
const CAMPOS: Record<string, string> = {
  Titulo: 'Título',
  Nome: 'Nome',
  Valor: 'Valor',
  Data: 'Data',
  Categoria: 'Categoria',
  MeioPagamento: 'Pago com',
  DiaDebito: 'Dia do débito',
  Limite: 'Limite',
  Saldo: 'Saldo',
  Ativo: 'Ativo',
  Fim: 'Fim',
  Texto: 'Texto',
  Prioridade: 'Prioridade',
  Ativa: 'Ativa',
  Objetivo: 'Objetivo',
  DataObjetivo: 'Data do objetivo',
  Role: 'Papel',
  EntradaEm: 'Entrada em',
  SaidaEm: 'Saída em',
  Modo: 'Divisão',
  Automatico: 'Automático',
  Tipo: 'Tipo',
  // Pessoas: os ids de utilizador mostram-se como nome ou email (ver nomeDoUtilizador)
  Uid: 'Quem',
  MembroUid: 'Membro',
  PagadorUid: 'Pago por',
  DeUid: 'De',
  ParaUid: 'Para',
  CriadoPorUid: 'Criado por',
};

const CAMPOS_DE_UTILIZADOR = new Set(['Uid', 'MembroUid', 'PagadorUid', 'DeUid', 'ParaUid', 'CriadoPorUid']);

// ---- Quem: os nomes dos membros dos grupos ----

export interface ContextoNomes {
  meuId?: string;
  // uid -> nome e email do membro (de todos os grupos a que pertenço)
  utilizadores?: Map<string, { nome?: string; email?: string }>;
  // id do grupo -> nome
  grupos?: Map<string, string>;
}

/**
 * Os nomes dos membros e dos grupos a que pertenço, para os registos dos grupos se lerem bem. Um grupo
 * ou membro que não se consiga ler fica de fora (aparece "Outro utilizador"); nunca lança erros.
 */
export async function carregarContextoNomes(meuId?: string): Promise<ContextoNomes> {
  const contexto: ContextoNomes = { meuId, utilizadores: new Map(), grupos: new Map() };
  try {
    const grupos = await GruposDB.listar();
    grupos.forEach((g) => contexto.grupos!.set(g.id, g.nome));
    const membros = await Promise.all(grupos.map((g) => GruposDB.listarMembros(g.id).catch(() => [])));
    membros.flat().forEach((m) => contexto.utilizadores!.set(m.uid, { nome: m.nome, email: m.email }));
  } catch (error) {
    console.warn('Não foi possível ler os nomes dos membros dos grupos:', error);
  }
  return contexto;
}

/** Os registos que falam de pessoas ou de grupos (precisam dos nomes dos membros para se lerem bem). */
export const precisaDeNomes = (registo: Pick<RegistoAlteracao, 'entidade' | 'alteracoes'>) =>
  registo.entidade === 'GrupoMembro' ||
  registo.entidade === 'AcertoPartilhado' ||
  Object.keys(registo.alteracoes ?? {}).some((campo) => CAMPOS_DE_UTILIZADOR.has(campo));

/**
 * Quem é este utilizador: "Tu", o nome e o email do membro do grupo ou "Utilizador removido"
 * (quem apagou a conta fica com um id anónimo "removido-...").
 */
export function nomeDoUtilizador(uid: string, contexto: ContextoNomes = {}): string {
  if (uid.startsWith('removido-')) return t('Utilizador removido');
  if (uid === contexto.meuId) return t('Tu');
  const membro = contexto.utilizadores?.get(uid);
  const nome = membro?.nome?.trim();
  const email = membro?.email?.trim();
  if (nome && email && nome.toLowerCase() !== email.toLowerCase()) return `${nome} (${email})`;
  return nome || email || t('Outro utilizador');
}

// Os ids técnicos (uuid ou hexadecimal) não dizem nada a quem lê o histórico
const pareceIdTecnico = (texto: string) => /^[0-9a-f]{16,}$/i.test(texto) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(texto);

/**
 * O título legível de um registo. A API guarda, para alguns tipos, uma descrição técnica: a
 * participação num grupo ("Admin <idDoGrupo>"), o acerto ("<uid> -> <uid>"), o movimento (o valor)
 * e a contribuição (o id da poupança). Aqui passam a nome do grupo, nomes das pessoas, valor, ou nada.
 */
export function descricaoLegivel(
  registo: Pick<RegistoAlteracao, 'entidade' | 'descricao'>,
  contexto: ContextoNomes = {}
): string | undefined {
  const texto = registo.descricao?.trim();
  if (!texto) return undefined;
  switch (registo.entidade) {
    case 'GrupoMembro': {
      const grupo = /^\S+\s+(\S+)$/.exec(texto)?.[1];
      return (grupo && contexto.grupos?.get(grupo)) || undefined;
    }
    case 'AcertoPartilhado': {
      const partes = /^(\S+) -> (\S+)$/.exec(texto);
      return partes ? `${nomeDoUtilizador(partes[1], contexto)} → ${nomeDoUtilizador(partes[2], contexto)}` : undefined;
    }
    case 'MovimentoPoupancaPartilhada': {
      const valor = Number(texto);
      return Number.isFinite(valor) ? `${valor.toFixed(2).replace('.', ',')} €` : undefined;
    }
    case 'PoupancaPartilhadaMembro':
      return undefined;
    default:
      return pareceIdTecnico(texto) ? undefined : texto;
  }
}

export const ehDoSistema = (registo: Pick<RegistoAlteracao, 'origem'>) => !registo.origem || registo.origem === 'sistema';

/**
 * A frase do histórico: "Apagaste a despesa fixa Combustível Carro". As feitas pela app sozinha
 * (ex.: gastos que se repetem, débitos automáticos): "Criado automaticamente: gasto Café".
 */
export function fraseAlteracao(
  registo: Pick<RegistoAlteracao, 'entidade' | 'descricao' | 'acao' | 'origem'>,
  contexto: ContextoNomes = {}
): string {
  const entidade = ENTIDADES[registo.entidade] ?? { nome: registo.entidade, feminino: false };
  const legivel = descricaoLegivel(registo, contexto);
  const titulo = legivel ? ` ${legivel}` : '';
  if (ehDoSistema(registo)) {
    return t('{acao} automaticamente: {entidade}{titulo}', {
      acao: t(VERBOS_SISTEMA[registo.acao]),
      entidade: t(entidade.nome),
      titulo,
    });
  }
  return t('{verbo} {artigo} {entidade}{titulo}', {
    verbo: t(VERBOS[registo.acao]),
    artigo: entidade.feminino ? 'a' : 'o',
    entidade: t(entidade.nome),
    titulo,
  });
}

/** "03/10 11:20" na hora do telemóvel. */
export function quandoCurto(quando: string): string {
  const data = new Date(quando);
  if (Number.isNaN(data.getTime())) return '';
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)} ${dois(data.getHours())}:${dois(data.getMinutes())}`;
}

const valorTexto = (valor: unknown): string => {
  if (valor === undefined || valor === null) return '—';
  if (typeof valor === 'number') return valor.toFixed(2).replace('.', ',');
  if (typeof valor === 'boolean') return valor ? t('sim') : t('não');
  if (valor === 'Conta') return t('conta');
  if (valor === 'CartaoAlimentacao') return t('cartão de alimentação');
  if (valor === 'Admin') return t('administrador');
  if (valor === 'Membro') return t('membro');
  if (typeof valor === 'string') {
    // Datas (com ou sem hora) aparecem como dd/mm/aaaa
    const dia = /^(\d{4}-\d{2}-\d{2})(T.*)?$/.exec(valor)?.[1];
    return dia ? dia.split('-').reverse().join('/') : valor;
  }
  return JSON.stringify(valor);
};

/**
 * Os detalhes, uma linha por campo: "Valor: 20,00 → 25,00". Os campos técnicos não aparecem; os de
 * pessoas mostram quem é (nome e email do membro, "Tu" ou "Utilizador removido").
 */
export function linhasDetalhe(registo: Pick<RegistoAlteracao, 'acao' | 'alteracoes'>, contexto: ContextoNomes = {}): string[] {
  return Object.entries(registo.alteracoes ?? {})
    .filter(([campo]) => campo in CAMPOS)
    .map(([campo, { de, para }]) => {
      const nome = t(CAMPOS[campo]);
      const mostrar = (valor: unknown) =>
        CAMPOS_DE_UTILIZADOR.has(campo) && typeof valor === 'string' ? nomeDoUtilizador(valor, contexto) : valorTexto(valor);
      if (registo.acao === 'criada') return t('{nome}: {valor}', { nome, valor: mostrar(para) });
      if (registo.acao === 'apagada') return t('{nome}: {valor}', { nome, valor: mostrar(de) });
      return t('{nome}: {de} → {para}', { nome, de: mostrar(de), para: mostrar(para) });
    });
}

/** Do mais recente para o mais antigo, sem repetidos (para juntar páginas e pedidos de vários tipos). */
export function ordenarRegistos(registos: RegistoAlteracao[]): RegistoAlteracao[] {
  const vistos = new Set<string>();
  return registos
    .filter((r) => !vistos.has(r.id) && !!vistos.add(r.id))
    .sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());
}

// Por tipo, para não pedir demasiado quando um filtro junta vários
const TAMANHO_POR_TIPO = 20;

export const AlteracoesDB = {
  listar(pagina = 1, tamanho = 30, entidade?: string): Promise<PaginaAlteracoes> {
    const filtro = entidade ? `&entidade=${encodeURIComponent(entidade)}` : '';
    return api.get<PaginaAlteracoes>(`/api/alteracoes?pagina=${pagina}&tamanho=${tamanho}${filtro}`);
  },

  /**
   * Uma página do histórico com um dos filtros: sem tipos = tudo; com um tipo, um pedido; com vários,
   * um pedido por tipo (a mesma página de cada) juntos por data. `total` é a soma dos totais.
   */
  async listarFiltrado(filtro: FiltroAlteracoes, pagina = 1): Promise<PaginaAlteracoes> {
    if (filtro.entidades.length <= 1) return AlteracoesDB.listar(pagina, 30, filtro.entidades[0]);
    const paginas = await Promise.all(filtro.entidades.map((e) => AlteracoesDB.listar(pagina, TAMANHO_POR_TIPO, e)));
    return {
      total: paginas.reduce((soma, p) => soma + p.total, 0),
      pagina,
      tamanho: TAMANHO_POR_TIPO,
      itens: ordenarRegistos(paginas.flatMap((p) => p.itens)),
    };
  },
};
