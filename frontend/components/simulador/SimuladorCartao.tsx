import { useState } from 'react';
import { Text, View } from 'react-native';
import { COR_CONTA, ICONE_CARTAO, ICONE_CONTA } from '../../constants/meiosPagamento';
import { useT } from '../../i18n';
import type { PrevisaoCartao } from '../../services/tipos';
import { euros } from '../../utils/orcamentos';
import { simularCartao } from '../../utils/simulacao';
import { Botao, CampoTexto, Cartao, CartaoSaldo, TituloSecao } from '../ui';
import { COR_SIMULADOR, estilos, LinhaResultado, numero, numeroOuNada } from './PecasSimulador';

interface SimuladorCartaoProps {
  cartao: PrevisaoCartao;
  previsaoConta: number; // a previsão do fim do mês da conta (sem o cartão)
  diasRestantes: number;
}

// A única previsão do simulador: o cartão de alimentação chega até ao fim do mês? Se não chegar, o que falta sai da
// conta (o cartão não fica negativo) e baixa o saldo da conta no fim do mês
export function SimuladorCartao({ cartao, previsaoConta, diasRestantes }: SimuladorCartaoProps) {
  const t = useT();
  const [gastoPorDia, setGastoPorDia] = useState('');
  const [carga, setCarga] = useState('');
  const [gastoExtra, setGastoExtra] = useState('');

  const sim = simularCartao(cartao, previsaoConta, diasRestantes, {
    gastoPorDia: numeroOuNada(gastoPorDia),
    carga: numeroOuNada(carga),
    gastoExtra: numero(gastoExtra),
  });

  function repor() {
    setGastoPorDia('');
    setCarga('');
    setGastoExtra('');
  }

  return (
    <>
      <Text style={estilos.subtitulo}>{t('O cartão chega até ao fim do mês?')}</Text>
      <Text style={estilos.nota}>{t('É uma previsão: parte do saldo de agora e do ritmo a que gastas com o cartão.')}</Text>
      <CartaoSaldo
        variante="laranja"
        rotulo={t('Cartão de alimentação no fim do mês')}
        valor={sim.previsaoFinal}
        icone={ICONE_CARTAO}
        subtitulo={sim.falta > 0 ? t('Não chega: faltam {falta}, que saíam da conta', { falta: euros(sim.falta) }) : t('Chega até ao fim do mês')}
        style={estilos.bloco}
      />

      <Cartao style={estilos.bloco}>
        <TituloSecao titulo={t('Contas do cartão')} icone="swap-vertical-outline" cor={COR_SIMULADOR} />
        <View style={estilos.resultado}>
          <LinhaResultado rotulo={t('Saldo do cartão agora')} valor={euros(cartao.saldo)} />
          {sim.carga > 0 && <LinhaResultado rotulo={t('Ainda vai carregar este mês')} valor={`+${euros(sim.carga)}`} />}
          <LinhaResultado rotulo={t('Gastos previstos até ao fim do mês')} valor={`-${euros(sim.estimativaGastos)}`} />
          <LinhaResultado rotulo={t('No fim do mês')} valor={euros(sim.previsaoFinal)} bom={sim.previsaoFinal >= 0} forte />
        </View>
        {sim.diasQueDura !== null && sim.carga === 0 && (
          <Text style={[estilos.aviso, { marginTop: 12 }]}>
            {t('Ao ritmo de gasto previsto, o saldo do cartão dura cerca de {dias} dias.', { dias: sim.diasQueDura })}
          </Text>
        )}
      </Cartao>

      {sim.falta > 0 && (
        <Cartao style={estilos.bloco}>
          <TituloSecao titulo={t('O que isto faz à conta')} icone={ICONE_CONTA} cor={COR_CONTA} />
          <View style={estilos.resultado}>
            <LinhaResultado rotulo={t('Conta no fim do mês (previsão normal)')} valor={euros(previsaoConta)} />
            <LinhaResultado rotulo={t('Menos o que o cartão não paga')} valor={`-${euros(sim.falta)}`} bom={false} />
            <LinhaResultado rotulo={t('Conta no fim do mês, com isto')} valor={euros(sim.contaFinal)} bom={sim.contaFinal >= 0} forte />
          </View>
        </Cartao>
      )}

      <Cartao style={estilos.bloco}>
        <TituloSecao titulo={t('E se…')} icone="options-outline" cor={COR_SIMULADOR} />
        <CampoTexto
          rotulo={t('Gastasse por dia com o cartão (€)')}
          placeholder={t('Agora: {valor} por dia', { valor: euros(cartao.mediaDiaria) })}
          keyboardType="numeric"
          value={gastoPorDia}
          onChangeText={setGastoPorDia}
          accessibilityLabel={t('Quanto gastas por dia com o cartão, em euros')}
        />
        <CampoTexto
          rotulo={t('O cartão carregasse este mês (€)')}
          placeholder={t('Agora: {valor}', { valor: euros(cartao.cargaPorReceber) })}
          keyboardType="numeric"
          value={carga}
          onChangeText={setCarga}
          accessibilityLabel={t('Quanto carrega o cartão este mês, em euros')}
        />
        <CampoTexto
          rotulo={t('Gastasse mais de uma vez (€)')}
          placeholder={t('ex: 30 (uma refeição que ainda não estava prevista)')}
          keyboardType="numeric"
          value={gastoExtra}
          onChangeText={setGastoExtra}
          accessibilityLabel={t('Gasto extra com o cartão, em euros')}
        />
      </Cartao>

      <Text style={estilos.nota}>
        {t('Só entram os gastos pagos com o cartão de alimentação, à parte da conta. O cartão não fica negativo: o que ele não chegar para pagar tem de sair da conta. A previsão usa a média por dia dos últimos meses.')}
      </Text>

      {sim.mexeu && <Botao variante="secundario" icone="refresh-outline" titulo={t('Repor tudo')} onPress={repor} style={estilos.bloco} />}
    </>
  );
}
