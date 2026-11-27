import { t } from '../i18n';
import { nomeMes } from '../services/calculos';
import { parseValor } from './formatos';
import type { ComparacaoEstrategias, Divida, Mes, ResultadoEstrategia, ResumoContrato } from '../services/tipos';

// Funções de apoio às dívidas com taxa (ecrã Dívidas): textos de prazos, datas e o que se escolhe nos simuladores

// Uma dívida com taxa (TAN) é um crédito: o valor guardado é o capital e há juros, selo e seguros
export const eCredito = (divida: Pick<Divida, 'taxaAnual'>): boolean => divida.taxaAnual !== undefined && divida.taxaAnual !== null;

// O que ainda falta pagar, como a pessoa o conta: sem taxa é o valor em falta; num crédito é tudo o que ainda vai
// sair (capital, juros, selo e seguros), e não só o capital que está em dívida
export function totalAPagar(divida: { emFalta: number; resumo?: Pick<ResumoContrato, 'viavel' | 'mesesRestantes' | 'totalRestante'> | null }): number {
  const r = divida.resumo;
  return r && r.viavel && r.mesesRestantes != null ? r.totalRestante : divida.emFalta;
}

// "2 anos e 3 meses", "1 ano", "8 meses", "1 mês"; 0 → "nenhuma prestação"
export function formatarDuracao(meses: number): string {
  if (meses <= 0) return t('nenhuma prestação');
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const tAnos = anos === 1 ? t('1 ano') : t('{n} anos', { n: anos });
  const tMeses = resto === 1 ? t('1 mês') : t('{n} meses', { n: resto });
  if (anos === 0) return tMeses;
  return resto === 0 ? tAnos : t('{anos} e {meses}', { anos: tAnos, meses: tMeses });
}

// "Dezembro 2031" (ou "—" sem mês)
export function textoMes(mes: Mes | null | undefined): string {
  return mes ? nomeMes(mes) : '—';
}

// "2026-10-05" → "05/10/2026" (sem passar por fusos horários)
export function dataCurta(iso: string | null | undefined): string {
  const partes = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : '—';
}

export const euro = (valor: number): string => `${valor.toFixed(2)} €`;

// 3.3 → "3.30 %" (os valores da app usam sempre duas casas decimais)
export const percentagem = (valor: number): string => `${valor.toFixed(2)} %`;

// Base64 de um ficheiro (para o enviar à API em JSON). Feito à mão: não depende de btoa nem de Buffer,
// que nem todos os motores (Hermes, jest) têm do mesmo modo
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function bytesParaBase64(bytes: Uint8Array): string {
  const partes: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const bloco = (a << 16) | (b << 8) | c;
    partes.push(
      ALFABETO[(bloco >> 18) & 63],
      ALFABETO[(bloco >> 12) & 63],
      i + 1 < bytes.length ? ALFABETO[(bloco >> 6) & 63] : '=',
      i + 2 < bytes.length ? ALFABETO[bloco & 63] : '='
    );
  }
  return partes.join('');
}

export type NomeEstrategia = 'soPrestacoes' | 'bolaDeNeve' | 'avalanche';

// A estratégia que custa menos juros (e, a empatar, acaba mais cedo). Só conta as que acabam
export function melhorEstrategia(c: ComparacaoEstrategias): NomeEstrategia {
  const candidatas: [NomeEstrategia, ResultadoEstrategia][] = [
    ['soPrestacoes', c.soPrestacoes],
    ['bolaDeNeve', c.bolaDeNeve],
    ['avalanche', c.avalanche],
  ];
  const viaveis = candidatas.filter(([, r]) => r.viavel);
  const lista = viaveis.length > 0 ? viaveis : candidatas;
  return lista.reduce((melhor, atual) =>
    atual[1].juros < melhor[1].juros || (atual[1].juros === melhor[1].juros && atual[1].meses < melhor[1].meses) ? atual : melhor
  )[0];
}

// Em que mês acaba uma estratégia a contar do mês atual: "daqui a 14 meses"
export function textoAcaba(r: ResultadoEstrategia): string {
  if (!r.viavel) return t('nunca (a prestação não chega para os juros)');
  return r.meses === 1 ? t('daqui a 1 mês') : t('daqui a {n} meses', { n: r.meses });
}

// ---- Formulário do contrato (os campos são texto até se guardar) ----

export interface ContratoTexto {
  taxa: string;
  financiado: string;
  entrada: string;
  prazo: string;
  inicio: string;
  encargos: string;
  comissao: string;
}

export const CONTRATO_VAZIO: ContratoTexto = { taxa: '', financiado: '', entrada: '', prazo: '', inicio: '', encargos: '', comissao: '' };

const comoTexto = (n: number | undefined | null): string => (n === undefined || n === null ? '' : String(n));

// Os campos de uma dívida em texto, para o formulário
export function contratoParaTexto(divida?: Divida): ContratoTexto {
  if (!divida) return { ...CONTRATO_VAZIO };
  return {
    taxa: comoTexto(divida.taxaAnual),
    financiado: comoTexto(divida.valorFinanciado),
    entrada: comoTexto(divida.entrada),
    prazo: comoTexto(divida.prazoMeses),
    inicio: divida.inicioContrato ?? '',
    encargos: comoTexto(divida.encargosMensais),
    comissao: comoTexto(divida.comissaoReembolso),
  };
}

export type CamposContrato = Pick<
  Divida,
  'taxaAnual' | 'valorFinanciado' | 'entrada' | 'prazoMeses' | 'inicioContrato' | 'encargosMensais' | 'comissaoReembolso'
>;

const numero = (texto: string): number => parseValor(texto);

// O texto do formulário em campos da dívida. Campo vazio = undefined (ao editar, apaga o valor antigo).
// Devolve o erro (em português) se algum valor não faz sentido
export function textoParaContrato(c: ContratoTexto): { campos: CamposContrato; erro: string | null } {
  const vazio = (s: string) => s.trim() === '';
  const campos: CamposContrato = {
    taxaAnual: undefined,
    valorFinanciado: undefined,
    entrada: undefined,
    prazoMeses: undefined,
    inicioContrato: undefined,
    encargosMensais: undefined,
    comissaoReembolso: undefined,
  };

  if (!vazio(c.taxa)) {
    const taxa = numero(c.taxa);
    if (taxa < 0 || taxa > 100) return { campos, erro: t('A taxa (TAN) tem de estar entre 0 e 100 %.') };
    campos.taxaAnual = taxa;
  }
  if (!vazio(c.comissao)) {
    const comissao = numero(c.comissao);
    if (comissao < 0 || comissao > 100) return { campos, erro: t('A comissão de reembolso tem de estar entre 0 e 100 %.') };
    campos.comissaoReembolso = comissao;
  }
  for (const [chave, texto, rotulo] of [
    ['valorFinanciado', c.financiado, 'O valor financiado'],
    ['entrada', c.entrada, 'A entrada'],
    ['encargosMensais', c.encargos, 'Os seguros e encargos'],
  ] as const) {
    if (vazio(texto)) continue;
    const valor = numero(texto);
    if (valor < 0) return { campos, erro: t('{campo} não pode ser negativo(a).', { campo: t(rotulo) }) };
    campos[chave] = valor;
  }
  if (!vazio(c.prazo)) {
    const prazo = numero(c.prazo);
    if (!Number.isInteger(prazo) || prazo < 1 || prazo > 1200) return { campos, erro: t('O prazo tem de ser um número de meses (1 a 1200).') };
    campos.prazoMeses = prazo;
  }
  if (!vazio(c.inicio)) {
    const inicio = c.inicio.trim();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(inicio)) return { campos, erro: t('O início do contrato tem de ser um mês no formato AAAA-MM (ex.: 2026-05).') };
    campos.inicioContrato = inicio;
  }
  return { campos, erro: null };
}
