import { cores } from '../constants/tema';
import { t } from '../i18n';
import { centimos, nomeMes } from '../services/calculos';
import type { EstadoObjetivo, EstadoOrcamento, EstadoOrcamentoMes, ObjetivoPoupanca } from '../services/tipos';
import { nomeCategoria } from './categorias';

// Textos e cores dos orçamentos e dos objetivos de poupança, sem React Native, para poder ser
// testado diretamente (__tests__/orcamentos.test.ts). Os números vêm calculados da API.

// "164 €" (redondo) ou "164.50 €" (o formato de sempre da app)
export function euros(valor: number): string {
  const v = centimos(valor);
  return Number.isInteger(v) ? `${v} €` : `${v.toFixed(2)} €`;
}

// ---- Orçamentos ----

export const corEstadoOrcamento = (estado: EstadoOrcamento): string =>
  estado === 'ultrapassado' ? cores.negativo : estado === 'perto' ? cores.aviso : cores.positivo;

export const textoEstadoOrcamento = (estado: EstadoOrcamento): string =>
  estado === 'ultrapassado' ? t('Ultrapassado') : estado === 'perto' ? t('Perto do limite') : t('Dentro do limite');

// "Faltam 36 €" ou "Passaste 10 €" (o restante nunca é negativo: passou = gasto - limite)
export function textoRestante(o: Pick<EstadoOrcamentoMes, 'gasto' | 'limite' | 'restante'>): string {
  const passou = centimos(o.gasto - o.limite);
  if (passou > 0) return t('Passaste {valor}', { valor: euros(passou) });
  if (passou === 0) return t('Chegaste ao limite');
  return t('Ainda podes gastar {valor}', { valor: euros(o.restante) });
}

export interface Alerta {
  titulo: string;
  mensagem: string;
}

// Depois de registar uma despesa: o aviso a mostrar se o orçamento da categoria chegou aos 80% ou
// passou do limite (null = está tudo bem, ou a categoria não tem orçamento)
export function alertaOrcamento(estado: EstadoOrcamentoMes | undefined): Alerta | null {
  if (!estado || estado.estado === 'ok') return null;
  const nome = nomeCategoria(estado.categoria);
  const percentagem = Math.round(estado.percentagem);
  const valores = t('({gasto} de {limite})', { gasto: euros(estado.gasto), limite: euros(estado.limite) });
  const mensagem = t('Já gastaste {percentagem}% do orçamento de {nome} {valores}.', { percentagem, nome, valores });
  return estado.estado === 'ultrapassado'
    ? {
        titulo: t('Orçamento ultrapassado'),
        mensagem,
      }
    : {
        titulo: t('Orçamento quase no limite'),
        mensagem,
      };
}

// Os orçamentos que merecem aviso (Início): os ultrapassados primeiro, depois os mais perto do limite
export function orcamentosEmAlerta(estados: EstadoOrcamentoMes[]): EstadoOrcamentoMes[] {
  return estados
    .filter((e) => e.estado !== 'ok')
    .sort((a, b) => Number(b.estado === 'ultrapassado') - Number(a.estado === 'ultrapassado') || b.percentagem - a.percentagem);
}

// ---- Objetivos de poupança ----

export const corEstadoObjetivo = (estado: EstadoObjetivo): string =>
  estado === 'atingido' ? cores.positivo : estado === 'atrasado' ? cores.aviso : cores.primaria;

export const textoEstadoObjetivo = (estado: EstadoObjetivo): string =>
  estado === 'atingido' ? t('Atingido') : estado === 'atrasado' ? t('Atrasado') : t('No bom caminho');

// "faltam 700 € · 233.34 €/mês até Dezembro 2026"
export function textoObjetivo(o: Pick<ObjetivoPoupanca, 'estado' | 'emFalta' | 'valorPorMes' | 'mesAlvo' | 'mesesRestantes'>): string {
  const mes = nomeMes(o.mesAlvo);
  if (o.estado === 'atingido' || o.emFalta <= 0) return t('Objetivo atingido (era até {mes})', { mes });
  if (o.mesesRestantes <= 0) return t('faltam {valor} · o prazo ({mes}) já passou', { valor: euros(o.emFalta), mes });
  return t('faltam {valor} · {porMes}/mês até {mes}', { valor: euros(o.emFalta), porMes: euros(o.valorPorMes), mes });
}

// O objetivo a mostrar no Início: o primeiro por atingir (a API já os ordena pelo mês alvo mais próximo)
export function objetivoPrincipal(objetivos: ObjetivoPoupanca[]): ObjetivoPoupanca | null {
  return objetivos.find((o) => o.estado !== 'atingido') ?? null;
}

// ---- Ritmo: onde se chega no fim do mês / no mês alvo ao ritmo de agora ----

export interface Ritmo {
  texto: string;
  cor: string;
}

// Orçamento no mês atual: "Ao ritmo atual chegas a 289 € no fim do mês (89 € acima do limite)".
// Sem previsão (outro mês), sem gasto ou já ultrapassado, não há nada a dizer
export function ritmoOrcamento(o: Pick<EstadoOrcamentoMes, 'estado' | 'limite' | 'gasto' | 'previsto'>): Ritmo | null {
  if (o.previsto == null || !(o.gasto > 0) || o.estado === 'ultrapassado') return null;
  const passa = centimos(o.previsto - o.limite);
  if (passa > 0) {
    return {
      texto: t('Ao ritmo atual chegas a {valor} no fim do mês ({passa} acima do limite)', { valor: euros(o.previsto), passa: euros(passa) }),
      cor: cores.aviso,
    };
  }
  return { texto: t('Ao ritmo atual ficas nos {valor} no fim do mês', { valor: euros(o.previsto) }), cor: cores.textoSecundario };
}

// Objetivo ligado a uma poupança: o que ela recebe por mês contra o que o objetivo pede, e quando se chega lá.
// Sem poupança ligada (valor à mão) ou já atingido, não há ritmo
export function ritmoObjetivo(
  o: Pick<ObjetivoPoupanca, 'estado' | 'emFalta' | 'valorPorMes' | 'mesesRestantes' | 'contribuicaoMensal' | 'diferenca' | 'mesPrevisto'>
): Ritmo | null {
  if (o.estado === 'atingido' || o.emFalta <= 0 || o.contribuicaoMensal == null) return null;
  const poupas = euros(o.contribuicaoMensal);
  if (!(o.contribuicaoMensal > 0)) {
    return { texto: t('A poupança ligada não recebe nada por mês: para lá chegares precisas de {valor}/mês', { valor: euros(o.valorPorMes) }), cor: cores.aviso };
  }
  const diferenca = o.diferenca ?? 0;
  if (!o.mesPrevisto) {
    return { texto: t('Poupas {poupas}/mês: ao ritmo atual demoras mais de 50 anos', { poupas }), cor: cores.aviso };
  }
  const mes = nomeMes(o.mesPrevisto);
  // Com o prazo já passado, só interessa quando se chega lá
  if (o.mesesRestantes <= 0) return { texto: t('Poupas {poupas}/mês: ao ritmo atual chegas em {mes}', { poupas, mes }), cor: cores.aviso };
  if (diferenca > 0) {
    return {
      texto: t('Poupas {poupas}/mês, mais {extra} do que o necessário: chegas em {mes}', { poupas, extra: euros(diferenca), mes }),
      cor: cores.positivo,
    };
  }
  if (diferenca === 0) return { texto: t('Poupas {poupas}/mês, o necessário: chegas em {mes}', { poupas, mes }), cor: cores.positivo };
  return {
    texto: t('Poupas {poupas}/mês, faltam {falta}/mês: ao ritmo atual chegas em {mes}', { poupas, falta: euros(Math.abs(diferenca)), mes }),
    cor: cores.aviso,
  };
}
