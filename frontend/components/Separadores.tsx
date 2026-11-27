import { router, usePathname } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { espaco } from '../constants/tema';
import { useDefinicoes } from '../services/definicoes';
import { Chip } from './ui';

// Ecrãs que partilham uma só entrada do menu: cada um mostra no topo os separadores do seu grupo
export const GRUPOS_MENU = {
  compromissos: [
    { rotulo: 'Despesas Fixas', rota: '/(tabs)/despesas-fixas' },
    { rotulo: 'Despesas Anuais', rota: '/(tabs)/anuais' },
    { rotulo: 'Dívidas', rota: '/(tabs)/dividas' },
  ],
  planeamento: [
    { rotulo: 'Orçamentos', rota: '/(tabs)/orcamentos' },
    { rotulo: 'Objetivos', rota: '/(tabs)/objetivos' },
    { rotulo: 'Poupanças', rota: '/(tabs)/configuracoes' },
    { rotulo: 'Simulador', rota: '/(tabs)/simulador' },
  ],
  mes: [
    { rotulo: 'Resumo do mês', rota: '/(tabs)/two' },
    { rotulo: 'Calendário', rota: '/(tabs)/calendario' },
  ],
} as const;

export type GrupoMenu = keyof typeof GRUPOS_MENU;

// O endereço de uma rota sem o grupo "(tabs)" (é o que o usePathname devolve)
export function caminhoDe(rota: string) {
  return rota.replace('/(tabs)', '') || '/';
}

export function Separadores({ grupo }: { grupo: GrupoMenu }) {
  const caminhoAtual = usePathname();
  const ocultos = useDefinicoes()?.ocultos ?? [];
  // A página onde estamos nunca desaparece (ex.: aberta por um atalho)
  const visiveis = GRUPOS_MENU[grupo].filter(
    (s) => caminhoAtual === caminhoDe(s.rota) || !ocultos.includes(s.rota.replace('/(tabs)/', ''))
  );
  // Com uma só página não há o que escolher
  if (visiveis.length < 2) return null;
  return (
    <View style={styles.linha}>
      {visiveis.map((s) => (
        <Chip
          key={s.rota}
          rotulo={s.rotulo}
          ativo={caminhoAtual === caminhoDe(s.rota)}
          onPress={() => router.replace(s.rota as any)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
    marginBottom: espaco.md,
  },
});
