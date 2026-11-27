import AsyncStorage from '@react-native-async-storage/async-storage';
import { ErroApi, api } from './api';
import { limparAlertas } from './alertas';
import { DEFINICOES_PADRAO, guardarDefinicoes, obterDefinicoes } from './definicoes';
import { limparFila } from './filaOffline';
import { cancelarLembretes } from './notificacoes';
import { PALAVRA_APAGAR } from '../utils/apagarConta';
import { esquecerPush } from './push';

// Apagar a conta e todos os dados (DELETE /api/conta). A API apaga tudo o que é do utilizador (nos
// grupos com mais gente, os dados dos outros ficam) mas não o utilizador no Firebase: esse passo é da
// app (contexts/AuthContext.apagarConta). Aqui ficam o pedido e a limpeza deste telemóvel.


export const ContaDB = {
  /** 204 quando apagou; 404 (já não havia nada) conta como apagado. */
  async apagar(): Promise<void> {
    try {
      await api.delete('/api/conta', { confirmacao: PALAVRA_APAGAR });
    } catch (erro) {
      if (erro instanceof ErroApi && erro.estado === 404) return;
      throw erro;
    }
  },
};

// O que fica de propósito: o idioma e a aparência são do telemóvel, não da conta
const MANTER = new Set(['@financas:idioma', '@financas:tema', '@financas:tema-reinicio', '@financas:definicoes']);
const PREFIXOS = ['@financas', 'financas', 'resumo.'];

/**
 * Limpa o que a conta deixou neste telemóvel: fila de gastos por enviar, preferências guardadas,
 * lembretes agendados, alertas em memória, o registo das push, o bloqueio e as opções das Definições
 * (menos o tema). Cada passo é independente: se um falhar os outros fazem-se na mesma.
 */
export async function limparDadosLocais(): Promise<void> {
  const passos: (() => Promise<unknown>)[] = [
    () => limparFila(),
    async () => {
      const chaves = await AsyncStorage.getAllKeys();
      const apagar = chaves.filter((c) => PREFIXOS.some((p) => c.startsWith(p)) && !MANTER.has(c));
      if (apagar.length > 0) await AsyncStorage.removeMany(apagar);
    },
    async () => {
      const { tema } = await obterDefinicoes();
      await guardarDefinicoes({ ...DEFINICOES_PADRAO, tema });
    },
    () => cancelarLembretes(),
    () => esquecerPush(),
    async () => limparAlertas(),
  ];
  for (const passo of passos) {
    try {
      await passo();
    } catch (erro) {
      console.warn('Erro ao limpar os dados locais:', erro);
    }
  }
}
