import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Cartao, TituloSecao, Botao } from './ui';
import { LinhaAlerta } from './LinhaAlerta';
import { cores } from '../constants/tema';
import { useT } from '../i18n';
import { atualizarAlertasSeNecessario, useAlertas } from '../services/alertas';
import { eAlertaDeOrcamento } from '../utils/alertas';

// Quantos alertas o painel mostra (o resto está no ecrã Alertas)
const MAXIMO = 3;

// Os alertas mais graves no Início. Sem alertas (ou sem os conseguir ler) não aparece nada: o painel
// não pode ficar pior por causa disto. "semOrcamentos": o painel já mostra o seu cartão de orçamentos
export function CartaoAlertas({ semOrcamentos = false }: { semOrcamentos?: boolean }) {
  const t = useT();
  const { alertas } = useAlertas(false);
  // Ao voltar ao Início (o ecrã fica montado): pede outra vez se já passou um minuto
  useFocusEffect(
    useCallback(() => {
      void atualizarAlertasSeNecessario();
    }, [])
  );
  const lista = (alertas ?? []).filter((a) => !(semOrcamentos && eAlertaDeOrcamento(a)));
  if (lista.length === 0) return null;

  return (
    <Cartao acento={cores.aviso}>
      <TituloSecao titulo={t('Alertas')} icone="notifications-outline" cor={cores.aviso} />
      {lista.slice(0, MAXIMO).map((alerta, i) => (
        <LinhaAlerta key={`${alerta.tipo}-${alerta.referencia ?? i}`} alerta={alerta} separada={i > 0} />
      ))}
      {lista.length > MAXIMO && (
        <Botao
          titulo={t('Ver todos ({n})', { n: lista.length })}
          variante="secundario"
          pequeno
          icone="list-outline"
          onPress={() => router.push('/(tabs)/alertas' as Href)}
        />
      )}
    </Cartao>
  );
}
