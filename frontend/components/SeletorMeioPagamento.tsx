import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../i18n';
import { useTemCartao } from '../services/saldoCartao';
import { COR_CARTAO, COR_CONTA, ICONE_CARTAO, ICONE_CONTA } from '../constants/meiosPagamento';
import { espaco, tipografia } from '../constants/tema';
import type { MeioPagamento } from '../services/tipos';
import { Chip } from './ui';

interface SeletorMeioPagamentoProps {
  valor: MeioPagamento;
  onChange: (meio: MeioPagamento) => void;
  saldoConta?: number; // undefined enquanto carrega
  saldoCartao?: number;
}

const euros = (valor: number | undefined) => (valor === undefined ? '…' : `${valor.toFixed(2)} €`);

// "Pagar com": a conta (Saldo Disponível) ou o cartão de alimentação, com o saldo de cada um.
// Sem cartão de alimentação (ligado no Salário) só há a conta: não há nada a escolher e não aparece
export function SeletorMeioPagamento({ valor, onChange, saldoConta, saldoCartao }: SeletorMeioPagamentoProps) {
  const t = useT();
  const { user } = useAuth();
  const temCartao = useTemCartao(user?.id);
  // O cartão foi desligado depois de se escolher (ex.: o último meio usado): volta à conta
  useEffect(() => {
    if (temCartao === false && valor === 'cartaoAlimentacao') onChange('conta');
  }, [temCartao, valor]);
  // Até se saber, não aparece (a não ser que o gasto já seja do cartão, para se ver como foi pago)
  if (temCartao !== true && valor !== 'cartaoAlimentacao') return null;
  return (
    <View style={styles.caixa}>
      <Text style={styles.rotulo}>{t('Pagar com')}</Text>
      <View style={styles.opcoes}>
        <Chip
          rotulo={t('Conta · {saldo}', { saldo: euros(saldoConta) })}
          icone={ICONE_CONTA}
          cor={COR_CONTA}
          ativo={valor === 'conta'}
          onPress={() => onChange('conta')}
          accessibilityLabel={t('Pagar com a conta, saldo {saldo}', { saldo: euros(saldoConta) })}
          style={styles.opcao}
        />
        <Chip
          rotulo={t('Cartão de alimentação · {saldo}', { saldo: euros(saldoCartao) })}
          icone={ICONE_CARTAO}
          cor={COR_CARTAO}
          ativo={valor === 'cartaoAlimentacao'}
          onPress={() => onChange('cartaoAlimentacao')}
          accessibilityLabel={t('Pagar com o cartão de alimentação, saldo {saldo}', { saldo: euros(saldoCartao) })}
          style={styles.opcao}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: {
    marginBottom: espaco.md,
  },
  rotulo: {
    ...tipografia.rotulo,
    fontSize: 11,
    marginBottom: 6,
  },
  opcoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  opcao: {
    flexGrow: 1,
  },
});
