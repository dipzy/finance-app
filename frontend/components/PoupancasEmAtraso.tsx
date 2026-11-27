import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { cores, espaco, tipografia } from '../constants/tema';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../i18n';
import { nomeMes, PoupancasDB } from '../services/database';
import { mensagemDaApi } from '../services/grupos';
import type { ContribuicaoEmAtraso } from '../services/tipos';
import { confirmar } from '../utils/confirmar';
import { mostrarAlerta } from '../utils/helpers';
import { Botao, Cartao, formatarEuro, TituloSecao, ValorEuro } from './ui';

// Contribuições manuais de meses anteriores que ficaram por enviar (os últimos 3). "Já enviei" regulariza o mês
// em atraso com o dinheiro de hoje: sai agora da conta e fica registado nesse mês. Sem nada em atraso não aparece

export function PoupancasEmAtraso({
  contribuicoes,
  onEnviada,
  maximo,
}: {
  contribuicoes: ContribuicaoEmAtraso[];
  onEnviada: () => void | Promise<void>;
  maximo?: number; // no painel só as primeiras
}) {
  const t = useT();
  const { user } = useAuth();
  // Uma de cada vez: a chave é o mês + a poupança
  const [aEnviar, setAEnviar] = useState<string | null>(null);

  if (contribuicoes.length === 0) return null;
  const visiveis = maximo ? contribuicoes.slice(0, maximo) : contribuicoes;
  const total = contribuicoes.reduce((soma, c) => soma + c.valor, 0);

  async function enviar(c: ContribuicaoEmAtraso) {
    if (!user?.id || aEnviar) return;
    const mes = nomeMes(c.mes);
    const confirmado = await confirmar(
      t('Enviar contribuição em atraso'),
      t('Enviar {nome} de {mes} ({valor})? O valor sai agora da conta e a contribuição fica registada em {mes}.', {
        nome: c.nome,
        mes,
        valor: formatarEuro(c.valor),
      }),
      'Já enviei'
    );
    if (!confirmado) return;

    setAEnviar(`${c.mes}_${c.poupancaId}`);
    try {
      const resultado = await PoupancasDB.contribuirManualmente(user.id, c.poupancaId, c.mes);
      if (resultado === 'saldo-insuficiente') {
        mostrarAlerta(t('Saldo insuficiente'), t('Não tens saldo suficiente na conta para fazer esta contribuição.'));
        return;
      }
      await onEnviada();
    } catch (error) {
      console.error('Erro ao enviar a contribuição em atraso:', error);
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível registar a contribuição deste mês.')));
    } finally {
      setAEnviar(null);
    }
  }

  return (
    <Cartao acento={cores.aviso}>
      <TituloSecao
        titulo={t('Poupanças por enviar de meses anteriores')}
        icone="wallet-outline"
        cor={cores.aviso}
        direita={<ValorEuro valor={total} cor={cores.aviso} style={styles.total} />}
      />
      {visiveis.map((c, i) => {
        const chave = `${c.mes}_${c.poupancaId}`;
        return (
          <View key={chave} style={[styles.linha, i > 0 && styles.separada]}>
            <View style={styles.textos}>
              <Text style={styles.titulo} numberOfLines={1}>
                {c.nome}
              </Text>
              <Text style={styles.nota}>{nomeMes(c.mes)}</Text>
            </View>
            <ValorEuro valor={c.valor} tipo="saida" style={styles.valor} />
            <Botao
              variante="secundario"
              pequeno
              titulo={t('Já enviei')}
              icone="checkmark-outline"
              onPress={() => enviar(c)}
              aCarregar={aEnviar === chave}
              desativado={aEnviar !== null}
              accessibilityLabel={t('Já enviei {nome} de {mes}', { nome: c.nome, mes: nomeMes(c.mes) })}
            />
          </View>
        );
      })}
      {contribuicoes.length > visiveis.length && (
        <Text style={styles.nota}>{t('+{n} mais', { n: contribuicoes.length - visiveis.length })}</Text>
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
    color: cores.aviso,
  },
  valor: {
    ...tipografia.secundario,
  },
});
