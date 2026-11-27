import { t } from '../i18n';
import type { AtividadeDto, DivisaoFixa, ModoDivisao, TransferenciaDto } from '../services/partilhado';
import { formatarEuro } from '../components/ui/ValorEuro';

// As contas da divisão no telemóvel, iguais às da API (Financas.Services/Regras/Partilhado.cs), só
// para mostrar a parte de cada um enquanto se preenche o formulário. Quem decide é a API.

export type ParticipanteLocal = { uid: string; peso?: number };

export type ResultadoDivisao = { partes: { uid: string; valor: number }[] } | { erro: string };

const centimos = (valor: number) => Math.round(valor * 100);

// Método do maior resto: cada um fica com o arredondamento para baixo e os cêntimos que faltam vão,
// um a um, para as maiores frações (em empate, para os primeiros da lista)
function proporcional(total: number, pesos: { uid: string; peso: number }[]) {
  const somaPesos = pesos.reduce((s, p) => s + p.peso, 0);
  const totalCentimos = centimos(total);
  const exatos = pesos.map((p) => (totalCentimos * p.peso) / somaPesos);
  const baixo = exatos.map((e) => Math.floor(e + 1e-9));
  let falta = totalCentimos - baixo.reduce((s, c) => s + c, 0);
  const ordem = exatos.map((e, i) => ({ i, resto: e - baixo[i] })).sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (let k = 0; falta > 0; k++, falta--) baixo[ordem[k % ordem.length].i]++;
  return pesos.map((p, i) => ({ uid: p.uid, valor: baixo[i] / 100 }));
}

export function dividir(total: number, modo: ModoDivisao, participantes: ParticipanteLocal[]): ResultadoDivisao {
  if (!(total > 0)) return { erro: t('Escreve o valor da despesa.') };
  if (participantes.length === 0) return { erro: t('Escolhe pelo menos uma pessoa para dividir a despesa.') };

  if (modo === 'igual') return { partes: proporcional(total, participantes.map((p) => ({ uid: p.uid, peso: 1 }))) };

  if (participantes.some((p) => !(p.peso && p.peso > 0))) {
    return { erro: t('Cada pessoa da divisão tem de ter um valor maior que zero.') };
  }
  const pesos = participantes.map((p) => ({ uid: p.uid, peso: p.peso as number }));
  const soma = pesos.reduce((s, p) => s + p.peso, 0);

  if (modo === 'valores') {
    if (centimos(soma) !== centimos(total)) {
      return {
        erro: t('As partes somam {soma}; faltam {falta}.', {
          soma: formatarEuro(soma),
          falta: formatarEuro(total - soma),
        }),
      };
    }
    return { partes: pesos.map((p) => ({ uid: p.uid, valor: centimos(p.peso) / 100 })) };
  }

  if (modo === 'percentagem' && Math.abs(soma - 100) > 1e-9) {
    return { erro: t('As percentagens somam {soma}% (têm de dar 100%).', { soma: Number(soma.toFixed(2)) }) };
  }

  return { partes: proporcional(total, pesos) };
}

/** Duas divisões de uma despesa fixa são a mesma (o grupo, o modo e as pessoas com o mesmo peso, pela ordem que for). */
export function mesmaDivisao(a: DivisaoFixa | null | undefined, b: DivisaoFixa | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  const normalizar = (d: DivisaoFixa) =>
    JSON.stringify([
      d.grupoId,
      d.modo,
      [...d.participantes]
        .map((p) => [p.uid, d.modo === 'igual' ? null : (p.peso ?? null)] as const)
        .sort((x, y) => x[0].localeCompare(y[0])),
    ]);
  return normalizar(a) === normalizar(b);
}

/** O meu saldo num grupo em palavras: "Recebes 12,00 €", "Deves 3,50 €" ou "Contas certas". */
export function textoSaldo(saldo: number): string {
  if (saldo > 0.004) return t('Recebes {valor}', { valor: formatarEuro(saldo) });
  if (saldo < -0.004) return t('Deves {valor}', { valor: formatarEuro(-saldo) });
  return t('Contas certas');
}

/** Um pagamento sugerido do meu ponto de vista: "Pagas 10,00 € à Ana" / "O Rui paga-te 5,00 €". */
export function textoTransferencia(
  tr: { deUid: string; deNome: string; paraUid: string; paraNome: string; valor: number },
  meuUid: string | undefined
): string {
  const valor = formatarEuro(tr.valor);
  if (tr.deUid === meuUid) return t('Pagas {valor} a {nome}', { valor, nome: tr.paraNome });
  if (tr.paraUid === meuUid) return t('{nome} paga-te {valor}', { valor, nome: tr.deNome });
  return t('{de} paga {valor} a {para}', { de: tr.deNome, valor, para: tr.paraNome });
}

/** O efeito de uma linha do feed no meu saldo: "emprestaste 60,00 €", "deves 30,00 €" ou "não entras". */
export function textoEfeito(efeito: number, entro: boolean): string {
  if (efeito > 0.004) return t('emprestaste {valor}', { valor: formatarEuro(efeito) });
  if (efeito < -0.004) return t('deves {valor}', { valor: formatarEuro(-efeito) });
  return entro ? t('contas certas') : t('não entras');
}

export type PendentesGrupo = {
  /** Despesas em que a minha parte ainda não aceitei. */
  porAceitar: AtividadeDto[];
  /** Pagamentos que tenho de fazer (os da lista "quem deve a quem" em que sou eu quem paga). */
  porPagar: TransferenciaDto[];
  /** Pagamentos que me fizeram e ainda não confirmei que recebi. */
  porConfirmar: AtividadeDto[];
  /** Pagamentos que me devem (só esperar). */
  aReceber: TransferenciaDto[];
  /** Despesas minhas com partes por aceitar e pagamentos meus por confirmar (só esperar). */
  aEsperar: AtividadeDto[];
};

/** O que está por resolver num grupo, do meu ponto de vista: o que me cabe a mim e o que depende dos outros. */
export function pendentesDoGrupo(atividade: AtividadeDto[], transferencias: TransferenciaDto[], meuUid: string | undefined): PendentesGrupo {
  return {
    porAceitar: atividade.filter((a) => a.tipo === 'despesa' && a.meuEstado === 'pendente'),
    porPagar: transferencias.filter((tr) => tr.deUid === meuUid),
    porConfirmar: atividade.filter((a) => a.tipo === 'acerto' && a.podeConfirmar),
    aReceber: transferencias.filter((tr) => tr.paraUid === meuUid),
    aEsperar: atividade.filter(
      (a) =>
        (a.tipo === 'despesa' && a.meuEstado !== 'pendente' && (a.porAceitar ?? 0) > 0) ||
        (a.tipo === 'acerto' && a.uid === meuUid && a.confirmado === false)
    ),
  };
}

/** Quantas coisas me cabe resolver (o número da bolinha da aba Pendentes): aceitar, pagar e confirmar. */
export function contarPendentes(atividade: AtividadeDto[], transferencias: TransferenciaDto[], meuUid: string | undefined): number {
  const p = pendentesDoGrupo(atividade, transferencias, meuUid);
  return p.porAceitar.length + p.porPagar.length + p.porConfirmar.length;
}
