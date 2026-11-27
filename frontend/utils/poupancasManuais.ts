import { t } from '../i18n';
import type { Mes, Poupanca } from '../services/tipos';
import { diaEMes } from './ecrasDespesas';

// As poupanças de contribuição manual: se a contribuição deste mês já foi enviada (POST /contribuir)
// ou ainda está por enviar. Sem React Native, para os testes (__tests__/poupancasManuais.test.ts).

export interface EstadoEnvio {
  porEnviar: boolean;
  texto: string; // "Por enviar este mês" ou "Enviada 05/10"
}

export function eManual(p: Poupanca): boolean {
  return p.contribuicaoAutomatica === false;
}

// null nas automáticas (saem sozinhas no dia certo)
export function estadoEnvio(p: Poupanca, mes: Mes): EstadoEnvio | null {
  if (!eManual(p)) return null;
  if (p.ultimaContribuicaoMes !== mes) return { porEnviar: true, texto: t('Por enviar este mês') };
  const dia = p.ultimaContribuicaoEm ? diaEMes(p.ultimaContribuicaoEm) : '';
  return { porEnviar: false, texto: dia ? t('Enviada {dia}', { dia }) : t('Enviada este mês') };
}

// As manuais ainda por enviar este mês (para o Início), pela ordem da lista
export function poupancasPorEnviar(poupancas: Poupanca[], mes: Mes): Poupanca[] {
  return poupancas.filter((p) => estadoEnvio(p, mes)?.porEnviar);
}
