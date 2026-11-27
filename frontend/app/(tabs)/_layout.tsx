import { Tabs } from 'expo-router';

import { cores } from '@/constants/tema';
import { useT } from '../../i18n';

export default function TabLayout() {
  const t = useT();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: cores.primaria,
        // Esconder a tab bar de baixo (a navegação é pelo menu lateral)
        tabBarShowLabel: false,
        tabBarStyle: { display: 'none' },
        headerShown: false,
        // Fundo escuro por trás de cada ecrã (sem clarão branco ao mudar de ecrã)
        sceneStyle: { backgroundColor: cores.fundo },
      }}>
      <Tabs.Screen
        name="welcome"
        options={{
          title: t('Início'),
        }}
      />
      {/* "/" (o antigo ecrã Finanças) só redireciona para o Início: fica declarada, sem entrada própria */}
      <Tabs.Screen
        name="index"
        options={{
          title: t('Início'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="despesas-fixas"
        options={{
          title: t('Despesas Fixas'),
        }}
      />
      <Tabs.Screen
        name="despesas-extras"
        options={{
          title: t('Gastos do Dia a Dia'),
        }}
      />
      <Tabs.Screen
        name="calendario"
        options={{
          title: t('Calendário'),
        }}
      />
      <Tabs.Screen
        name="salario"
        options={{
          title: t('Salário'),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: t('Resumo do mês'),
        }}
      />
      <Tabs.Screen
        name="importar"
        options={{
          title: t('Importar Excel'),
        }}
      />
      <Tabs.Screen
        name="extrato"
        options={{
          title: t('Importar extrato'),
        }}
      />
      <Tabs.Screen
        name="configuracoes"
        options={{
          title: t('Poupanças'),
        }}
      />
      <Tabs.Screen
        name="poupanca-partilhada"
        options={{
          title: t('Poupança conjunta'),
        }}
      />
      <Tabs.Screen
        name="anuais"
        options={{
          title: t('Despesas Anuais'),
        }}
      />
      <Tabs.Screen
        name="dividas"
        options={{
          title: t('Dívidas'),
        }}
      />
      <Tabs.Screen
        name="orcamentos"
        options={{
          title: t('Orçamentos'),
        }}
      />
      <Tabs.Screen
        name="objetivos"
        options={{
          title: t('Objetivos'),
        }}
      />
      <Tabs.Screen
        name="simulador"
        options={{
          title: t('Simulador'),
        }}
      />
      <Tabs.Screen
        name="definicoes"
        options={{
          title: t('Definições'),
        }}
      />
      {/* Ecrãs abertos a partir de outros (lupa dos Gastos do Dia a Dia, Definições): sem entrada no menu */}
      <Tabs.Screen
        name="pesquisa"
        options={{
          title: t('Pesquisar gastos'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="alertas"
        options={{
          title: t('Alertas'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="regras-categoria"
        options={{
          title: t('Regras de categorização'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="historico"
        options={{
          title: t('Histórico de alterações'),
          href: null,
        }}
      />
      {/* Ecrã de detalhe do grupo (rota dinâmica): sem entrada no menu */}
      <Tabs.Screen
        name="grupo/[id]"
        options={{
          title: t('Grupo'),
          href: null,
        }}
      />
    </Tabs>
  );
}
