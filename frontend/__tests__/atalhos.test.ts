// Os atalhos do ícone da app (expo-quick-actions): o que cada um abre

import { ATALHO_NOVO_GASTO, ATALHOS, destinoDoAtalho } from '../services/atalhos';

describe('atalhos do ícone', () => {
  it('são três, pela ordem do menu, com os nomes em português', () => {
    expect(ATALHOS.map((a) => a.title)).toEqual(['Novo gasto', 'Gastos do dia a dia', 'Resumo do mês']);
  });

  it('"Novo gasto" abre a folha sem mudar de ecrã', () => {
    expect(destinoDoAtalho({ id: ATALHO_NOVO_GASTO, params: {} })).toEqual({ abrirGastoRapido: true });
  });

  it('os outros abrem o ecrã do href', () => {
    expect(destinoDoAtalho(ATALHOS[1])).toEqual({ href: '/(tabs)/despesas-extras', abrirGastoRapido: false });
    expect(destinoDoAtalho(ATALHOS[2])).toEqual({ href: '/(tabs)/two', abrirGastoRapido: false });
  });

  it('ignora atalhos desconhecidos ou com destinos fora da app', () => {
    expect(destinoDoAtalho(null)).toBeNull();
    expect(destinoDoAtalho(undefined)).toBeNull();
    expect(destinoDoAtalho({ id: 'velho', params: null })).toBeNull();
    expect(destinoDoAtalho({ id: 'mau', params: { href: 'https://exemplo.pt' } })).toBeNull();
  });
});
