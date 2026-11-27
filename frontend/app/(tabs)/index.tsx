import { Redirect } from 'expo-router';

// O ecrã Finanças deixou de existir: o painel é o Início e a folha do mês está no Resumo do mês.
// O endereço "/" (a rota por defeito das tabs) continua a funcionar e vai para o Início
export default function IndexScreen() {
  return <Redirect href="/(tabs)/welcome" />;
}
