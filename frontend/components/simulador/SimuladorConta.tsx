import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useT } from '../../i18n';
import { centimos } from '../../services/calculos';
import type { Categoria, Poupanca, ValorCategoria } from '../../services/tipos';
import { euros } from '../../utils/orcamentos';
import { simularCartaoMes, simularMes, simularPoupancas, textoDiferenca, textoVersus } from '../../utils/simulacao';
import { Botao, CampoTexto, Cartao, CartaoSaldo, TituloSecao } from '../ui';
import {
  BlocoGastos,
  CamposPoupancas,
  COR_SIMULADOR,
  estilos,
  LinhaResultado,
  numeroOuNada,
  type Origem,
  type Periodo,
} from './PecasSimulador';

interface SimuladorContaProps {
  periodo: Periodo;
  gastosConta: ValorCategoria[]; // o que se gastou em cada categoria com a conta, de qualquer tipo de despesa
  gastosCartao: ValorCategoria[] | null; // e com o cartão de alimentação (null: sem cartão)
  cargaMensal: number; // o que o cartão carrega por mês
  fixasPorPagar: number; // as despesas mensais que ainda faltam pagar este mês (só conta no mês atual)
  receita: number; // o que se recebe por mês (o salário)
  poupancas: Poupanca[];
  novasContribuicoes: Record<string, string>;
  onNovaContribuicao: (id: string, texto: string) => void;
  onReporPoupancas: () => void;
}

type Escritos = Record<Origem, Partial<Record<Categoria, string>>>;
const SEM_ESCRITOS: Escritos = { conta: {}, cartao: {} };

// Para cada categoria o que se gastou (despesas mensais e do dia a dia), com a conta e com o cartão de alimentação, no
// mesmo sítio. Só valores reais: o que recebo - poupanças = livre antes de gastar; menos o que se gastou = o que sobra
export function SimuladorConta({
  periodo,
  gastosConta,
  gastosCartao,
  cargaMensal,
  fixasPorPagar,
  receita,
  poupancas,
  novasContribuicoes,
  onNovaContribuicao,
  onReporPoupancas,
}: SimuladorContaProps) {
  const t = useT();
  const [receitaNova, setReceitaNova] = useState('');
  const [escritos, setEscritos] = useState<Escritos>(SEM_ESCRITOS);

  const poupancasSimuladas = useMemo(
    () => simularPoupancas(poupancas, Object.fromEntries(Object.entries(novasContribuicoes).map(([id, texto]) => [id, numeroOuNada(texto)]))),
    [poupancas, novasContribuicoes]
  );
  const valoresNovos = (origem: Origem) =>
    Object.fromEntries(Object.entries(escritos[origem]).map(([categoria, texto]) => [categoria, numeroOuNada(texto)]));

  const resultado = simularMes(
    { receita, poupancas: poupancasSimuladas.atual.mensal, gastos: gastosConta, porPagar: periodo === 'atual' ? fixasPorPagar : 0 },
    {
      receita: numeroOuNada(receitaNova),
      poupancas: poupancasSimuladas.mexeu ? poupancasSimuladas.simulado.mensal : undefined,
      novos: valoresNovos('conta'),
    }
  );
  const cartao = gastosCartao ? simularCartaoMes(cargaMensal, gastosCartao, valoresNovos('cartao')) : null;

  const sobraSemMudancas = centimos(resultado.sobra - resultado.diferenca);
  // O que as mudanças dão no total (conta e cartão)
  const diferencaTotal = centimos(resultado.diferenca + (cartao?.poupado ?? 0));
  const poupadoNosGastos = centimos(resultado.poupado + (cartao?.poupado ?? 0));
  const mexeu = resultado.mexeu || poupancasSimuladas.mexeu || (cartao?.mexeu ?? false);
  const semSalario = receita <= 0 && numeroOuNada(receitaNova) === undefined;

  function repor() {
    setReceitaNova('');
    setEscritos(SEM_ESCRITOS);
    onReporPoupancas();
  }

  return (
    <>
      <CartaoSaldo
        variante="primario"
        rotulo={periodo === 'media' ? t('Sobra por mês, em média') : t('Sobra este mês')}
        valor={resultado.sobra}
        icone="cash-outline"
        subtitulo={textoVersus(resultado.diferenca, sobraSemMudancas, mexeu)}
        style={estilos.bloco}
      />
      {periodo === 'media' && diferencaTotal !== 0 && (
        <Text style={estilos.nota}>{t('Num ano: {valor}', { valor: textoDiferenca(centimos(diferencaTotal * 12)) })}</Text>
      )}
      {semSalario && (
        <Text style={estilos.aviso}>{t('Ainda não definiste o salário (no menu Salário): escreve em baixo um valor para simular.')}</Text>
      )}

      <Cartao style={estilos.bloco}>
        <TituloSecao titulo={t('Para onde vai o que recebes')} icone="swap-vertical-outline" cor={COR_SIMULADOR} />
        <View style={estilos.resultado}>
          <LinhaResultado rotulo={t('Recebes por mês')} valor={euros(resultado.receita)} />
          <LinhaResultado rotulo={t('Poupanças')} valor={`-${euros(resultado.poupancas)}`} />
          <LinhaResultado rotulo={t('Livre antes de gastar')} valor={euros(resultado.antesDeGastar)} bom={resultado.antesDeGastar >= 0} />
          <LinhaResultado
            rotulo={cartao ? t('Despesas e gastos da conta') : t('Despesas e gastos')}
            valor={`-${euros(resultado.gastos)}`}
          />
          {resultado.porPagar > 0 && (
            <LinhaResultado rotulo={t('Despesas mensais ainda por pagar (previsto)')} valor={`-${euros(resultado.porPagar)}`} />
          )}
          <LinhaResultado rotulo={cartao ? t('Sobra na conta') : t('Sobra')} valor={euros(resultado.sobra)} bom={resultado.sobra >= 0} forte />
        </View>
        {cartao && (
          <View style={estilos.resultado}>
            <LinhaResultado rotulo={t('O cartão carrega por mês')} valor={euros(cartao.carga)} />
            <LinhaResultado rotulo={t('Gastos pagos com o cartão')} valor={`-${euros(cartao.gastos)}`} />
            <LinhaResultado rotulo={t('Sobra no cartão')} valor={euros(cartao.sobra)} bom={cartao.sobra >= 0} forte />
          </View>
        )}
        {poupadoNosGastos !== 0 && (
          <View style={estilos.resultado}>
            <LinhaResultado
              rotulo={poupadoNosGastos > 0 ? t('Poupas com as mudanças') : t('Gastas mais com as mudanças')}
              valor={euros(Math.abs(poupadoNosGastos))}
              bom={poupadoNosGastos > 0}
            />
          </View>
        )}
      </Cartao>

      <Cartao style={estilos.bloco}>
        <TituloSecao titulo={t('E se…')} icone="options-outline" cor={COR_SIMULADOR} />
        <CampoTexto
          rotulo={t('Recebesse por mês (€)')}
          placeholder={t('Agora: {valor}', { valor: euros(receita) })}
          keyboardType="numeric"
          value={receitaNova}
          onChangeText={setReceitaNova}
          accessibilityLabel={t('Quanto recebes por mês, em euros')}
        />
      </Cartao>

      <BlocoGastos
        conta={gastosConta}
        cartao={gastosCartao}
        escritos={escritos}
        novos={{ conta: resultado.novosAplicados, cartao: cartao?.novosAplicados ?? {} }}
        onChange={(origem, categoria, texto) =>
          setEscritos((atual) => ({ ...atual, [origem]: { ...atual[origem], [categoria]: texto } }))
        }
        rotuloBase={(valor) => (periodo === 'media' ? t('média {valor}', { valor }) : t('este mês {valor}', { valor }))}
        vazio={periodo === 'media' ? t('Ainda não há gastos para fazer a média.') : t('Ainda não gastaste nada este mês.')}
      />

      {poupancas.length > 0 && (
        <Cartao style={estilos.bloco}>
          <TituloSecao titulo={t('E se mudasse as poupanças?')} icone="trending-up-outline" cor={COR_SIMULADOR} />
          <Text style={estilos.nota}>{t('Escreve quanto passavas a pôr de lado por mês em cada uma.')}</Text>
          <CamposPoupancas poupancas={poupancas} valores={novasContribuicoes} onChange={onNovaContribuicao} />
          {poupancasSimuladas.mexeu && (
            <View style={estilos.resultado}>
              <LinhaResultado
                rotulo={t('Pões de lado por mês')}
                valor={`${euros(poupancasSimuladas.simulado.mensal)} (${textoDiferenca(poupancasSimuladas.diferencaMensal)})`}
                bom={poupancasSimuladas.diferencaMensal >= 0}
              />
            </View>
          )}
        </Cartao>
      )}

      {mexeu && <Botao variante="secundario" icone="refresh-outline" titulo={t('Repor tudo')} onPress={repor} style={estilos.bloco} />}
    </>
  );
}
