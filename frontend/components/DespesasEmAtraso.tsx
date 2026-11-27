import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { cores, espaco, tipografia } from '../constants/tema';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../i18n';
import { DespesasFixasDB, nomeMes } from '../services/database';
import { mensagemDaApi } from '../services/grupos';
import { reagendarNotificacoes } from '../services/notificacoes';
import { confirmar } from '../utils/confirmar';
import { mostrarAlerta } from '../utils/helpers';
import type { PagamentoEmAtraso, ResumoEmAtraso } from '../utils/painel';
import { Botao, Cartao, formatarEuro, TituloSecao, ValorEuro } from './ui';

// Despesas fixas de meses anteriores que ficaram por pagar (os últimos 3). Pagar aqui paga o mês em atraso
// com o dinheiro de hoje: o pagamento fica nesse mês e o valor sai da conta agora. Sem nada em atraso não aparece

export function DespesasEmAtraso({
  resumo,
  onPago,
  maximo,
}: {
  resumo: ResumoEmAtraso;
  onPago: () => void | Promise<void>;
  maximo?: number; // no painel só as primeiras; o ecrã das despesas fixas mostra todas
}) {
  const t = useT();
  const { user } = useAuth();
  // Uma de cada vez: a chave é o mês + a despesa
  const [aPagar, setAPagar] = useState<string | null>(null);

  if (resumo.pagamentos.length === 0) return null;
  const visiveis = maximo ? resumo.pagamentos.slice(0, maximo) : resumo.pagamentos;

  async function pagar(p: PagamentoEmAtraso) {
    if (!user?.id || aPagar) return;
    const mes = nomeMes(p.mes);
    const confirmado = await confirmar(
      t('Pagar despesa em atraso'),
      t('Pagar {titulo} de {mes} ({valor})? O valor sai agora da conta e o pagamento fica registado em {mes}.', {
        titulo: p.titulo,
        mes,
        valor: formatarEuro(p.valor),
      }),
      'Pagar'
    );
    if (!confirmado) return;

    setAPagar(`${p.mes}_${p.fixaId}`);
    try {
      const resultado = await DespesasFixasDB.debitar(user.id, p.fixaId, p.mes);
      if (resultado === 'saldo-insuficiente') {
        mostrarAlerta(t('Saldo insuficiente'), t('Não tens saldo suficiente para debitar esta despesa.'));
        return;
      }
      reagendarNotificacoes();
      await onPago();
    } catch (error) {
      console.error('Erro ao pagar despesa em atraso:', error);
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível atualizar a despesa.')));
    } finally {
      setAPagar(null);
    }
  }

  return (
    <Cartao acento={cores.negativo}>
      <TituloSecao
        titulo={t('Por pagar de meses anteriores')}
        icone="alert-circle-outline"
        cor={cores.negativo}
        direita={<ValorEuro valor={resumo.total} cor={cores.negativo} style={styles.total} />}
      />
      {visiveis.map((p, i) => {
        const chave = `${p.mes}_${p.fixaId}`;
        return (
          <View key={chave} style={[styles.linha, i > 0 && styles.separada]}>
            <View style={styles.textos}>
              <Text style={styles.titulo} numberOfLines={1}>
                {p.titulo}
              </Text>
              <Text style={styles.nota}>
                {p.dia === undefined ? nomeMes(p.mes) : t('{mes} · dia {dia}', { mes: nomeMes(p.mes), dia: p.dia })}
              </Text>
            </View>
            <ValorEuro valor={p.valor} tipo="saida" style={styles.valor} />
            <Botao
              variante="secundario"
              pequeno
              titulo={t('Pagar')}
              icone="checkmark-outline"
              onPress={() => pagar(p)}
              aCarregar={aPagar === chave}
              desativado={aPagar !== null}
              accessibilityLabel={t('Pagar {titulo} de {mes}', { titulo: p.titulo, mes: nomeMes(p.mes) })}
            />
          </View>
        );
      })}
      {resumo.pagamentos.length > visiveis.length && (
        <Text style={styles.nota}>{t('+{n} mais', { n: resumo.pagamentos.length - visiveis.length })}</Text>
      )}
    </Cartao>
  );
}

const styles = StyleSheet.create({
  total: {
    ...tipografia.secundario,
    fontWeight: '700',
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    paddingVertical: espaco.sm,
  },
  separada: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.borda,
  },
  textos: {
    flex: 1,
  },
  titulo: {
    ...tipografia.corpo,
  },
  nota: {
    ...tipografia.nota,
    color: cores.negativo,
  },
  valor: {
    ...tipografia.secundario,
  },
});
