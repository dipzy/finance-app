import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { cores, espaco, tipografia } from '../../constants/tema';
import { useT } from '../../i18n';
import type { DividaComEstado } from '../../services/database';
import { DividasApi } from '../../services/dividas';
import { mensagemDaApi } from '../../services/grupos';
import type { CenarioDivida, SimulacaoDivida } from '../../services/tipos';
import { euro, formatarDuracao, percentagem, textoMes } from '../../utils/dividas';
import { parseValor } from '../../utils/formatos';
import { ModalFormulario, estilosFormulario } from '../ModalFormulario';
import { Botao, CampoTexto, Chip } from '../ui';
import { Caixa, LinhaDado, SubTitulo } from './partes';

const ATALHOS = [500, 1000, 2000, 5000];

// Simulador de uma dívida com taxa: "e se eu amortizar X? e se pagar tudo? e se pagar mais por mês?".
// As contas são da API (nada é gravado); aqui só se pedem e se mostram, lado a lado com a situação atual
export function SimuladorDivida({ divida, onFechar }: { divida: DividaComEstado | null; onFechar: () => void }) {
  const t = useT();
  const [amortizacao, setAmortizacao] = useState('');
  const [extra, setExtra] = useState('');
  const [resultado, setResultado] = useState<SimulacaoDivida | null>(null);
  const [aCalcular, setACalcular] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const simular = useCallback(
    async (texto: { amortizacao: string; extra: string }) => {
      if (!divida) return;
      setACalcular(true);
      setErro(null);
      try {
        const valorAmortizacao = parseValor(texto.amortizacao);
        const valorExtra = parseValor(texto.extra);
        setResultado(
          await DividasApi.simular(divida.id, {
            amortizacao: valorAmortizacao > 0 ? valorAmortizacao : undefined,
            extraMensal: valorExtra > 0 ? valorExtra : undefined,
          })
        );
      } catch (e) {
        setResultado(null);
        setErro(mensagemDaApi(e, t('Não foi possível simular.')));
      } finally {
        setACalcular(false);
      }
    },
    [divida]
  );

  // Ao abrir, já mostra a situação atual e o que custa pagar tudo
  useEffect(() => {
    setAmortizacao('');
    setExtra('');
    setResultado(null);
    setErro(null);
    if (divida) void simular({ amortizacao: '', extra: '' });
  }, [divida?.id]);

  if (!divida) return null;
  const poupa = cores.positivo;

  return (
    <ModalFormulario visivel titulo={t('Simular: {titulo}', { titulo: divida.titulo })} onFechar={onFechar}>
      <Text style={estilosFormulario.nota}>
        {t('Nada é gravado: é só uma simulação com os teus números (capital em dívida {capital}, taxa {taxa}).', {
          capital: euro(divida.emFalta),
          taxa: percentagem(divida.taxaAnual ?? 0),
        })}
      </Text>

      <CampoTexto
        rotulo={t('Amortizar de uma vez (€)')}
        placeholder={t('Ex.: 2000')}
        keyboardType="numeric"
        value={amortizacao}
        onChangeText={setAmortizacao}
      />
      <View style={styles.atalhos}>
        {ATALHOS.map((valor) => (
          <Chip key={valor} rotulo={`${valor} €`} onPress={() => setAmortizacao(String(valor))} ativo={parseValor(amortizacao) === valor} />
        ))}
      </View>
      <CampoTexto
        rotulo={t('Pagar mais por mês (€)')}
        placeholder={t('Ex.: 50')}
        keyboardType="numeric"
        value={extra}
        onChangeText={setExtra}
      />
      <Botao
        titulo={aCalcular ? t('A calcular…') : t('Simular')}
        icone="calculator-outline"
        onPress={() => simular({ amortizacao, extra })}
        desativado={aCalcular}
        style={estilosFormulario.botaoPrincipal}
      />

      {aCalcular && !resultado && <ActivityIndicator color={cores.primaria} style={styles.carregar} />}
      {!!erro && <Text style={styles.erro}>{erro}</Text>}

      {resultado && (
        <View>
          <SubTitulo>{t('Se não fizeres nada')}</SubTitulo>
          <Caixa>
            <LinhaDado
              rotulo={t('Prestação')}
              valor={euro(resultado.atual.prestacaoTotal)}
              nota={t('{capitalJuros} de capital e juros', { capitalJuros: euro(resultado.atual.prestacao) })}
            />
            <LinhaDado
              rotulo={t('Faltam')}
              valor={resultado.atual.viavel ? formatarDuracao(resultado.atual.meses) : '—'}
              nota={resultado.atual.fim ? t('Acaba em {mes}', { mes: textoMes(resultado.atual.fim) }) : undefined}
            />
            <LinhaDado rotulo={t('Juros que vais pagar')} valor={euro(resultado.atual.juros)} />
            <LinhaDado rotulo={t('Total que vais pagar')} valor={euro(resultado.atual.totalAPagar)} forte />
            {!resultado.atual.viavel && (
              <Text style={styles.erro}>{t('A prestação não chega para pagar os juros: a dívida não desce.')}</Text>
            )}
          </Caixa>

          <SubTitulo>{t('Pagar tudo agora')}</SubTitulo>
          <Cenario cenario={resultado.amortizacaoTotal} atual={resultado.atual} mostrarPrestacao={false} corPoupanca={poupa} />

          {resultado.manterPrestacao && (
            <>
              <SubTitulo>{t('Amortizar {valor}: manter a prestação', { valor: euro(resultado.manterPrestacao.amortizadoAgora) })}</SubTitulo>
              <Cenario cenario={resultado.manterPrestacao} atual={resultado.atual} corPoupanca={poupa} />
            </>
          )}
          {resultado.reduzirPrestacao && (
            <>
              <SubTitulo>{t('Amortizar {valor}: reduzir a prestação', { valor: euro(resultado.reduzirPrestacao.amortizadoAgora) })}</SubTitulo>
              <Cenario cenario={resultado.reduzirPrestacao} atual={resultado.atual} corPoupanca={poupa} />
            </>
          )}
          {resultado.extraMensal && (
            <>
              <SubTitulo>{t('Pagar mais {valor} por mês', { valor: euro(resultado.extraMensal.prestacao - resultado.atual.prestacao) })}</SubTitulo>
              <Cenario cenario={resultado.extraMensal} atual={resultado.atual} corPoupanca={poupa} />
            </>
          )}

          {resultado.comissaoReembolso <= 0 && (
            <Text style={styles.nota}>
              {t('Comissão de reembolso antecipado: 0 %. Se o teu contrato tem comissão, preenche-a na dívida para a simulação a contar.')}
            </Text>
          )}
        </View>
      )}

      <Botao variante="fantasma" titulo={t('Fechar')} onPress={onFechar} style={styles.fechar} />
    </ModalFormulario>
  );
}

// Um cenário: o que acaba por acontecer e o que se poupa em relação a não fazer nada
function Cenario({
  cenario,
  atual,
  corPoupanca,
  mostrarPrestacao = true,
}: {
  cenario: CenarioDivida;
  atual: CenarioDivida;
  corPoupanca: string;
  mostrarPrestacao?: boolean;
}) {
  const t = useT();
  const paga = cenario.meses === 0;
  return (
    <Caixa destaque={cenario.poupancaLiquida > 0 ? corPoupanca : undefined}>
      {cenario.amortizadoAgora > 0 && (
        <LinhaDado
          rotulo={t('Pagas agora')}
          valor={euro(cenario.amortizadoAgora + cenario.comissao)}
          nota={cenario.comissao > 0 ? t('Inclui {valor} de comissão', { valor: euro(cenario.comissao) }) : undefined}
        />
      )}
      {mostrarPrestacao && !paga && (
        <LinhaDado
          rotulo={t('Prestação')}
          valor={euro(cenario.prestacaoTotal)}
          nota={cenario.prestacao !== atual.prestacao ? t('Era {valor}', { valor: euro(atual.prestacaoTotal) }) : undefined}
        />
      )}
      <LinhaDado
        rotulo={paga ? t('Dívida') : t('Faltam')}
        valor={paga ? t('paga') : formatarDuracao(cenario.meses)}
        nota={cenario.fim ? t('Acaba em {mes}', { mes: textoMes(cenario.fim) }) : undefined}
      />
      {cenario.mesesPoupados > 0 && <LinhaDado rotulo={t('Menos prestações')} valor={String(cenario.mesesPoupados)} />}
      {!paga && <LinhaDado rotulo={t('Juros que ainda pagas')} valor={euro(cenario.juros)} />}
      <LinhaDado rotulo={t('Juros que evitas')} valor={euro(cenario.poupancaJuros)} />
      <LinhaDado
        forte
        rotulo={cenario.poupancaLiquida >= 0 ? t('Poupas no total') : t('Perdes no total')}
        valor={euro(Math.abs(cenario.poupancaLiquida))}
        cor={cenario.poupancaLiquida > 0 ? corPoupanca : cenario.poupancaLiquida < 0 ? cores.negativo : undefined}
        nota={t('Juros, selo e seguros que deixas de pagar, menos a comissão')}
      />
    </Caixa>
  );
}

const styles = StyleSheet.create({
  atalhos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: espaco.md },
  carregar: { marginVertical: espaco.lg },
  erro: { ...tipografia.secundario, color: cores.negativo, fontSize: 13, marginTop: espaco.sm },
  nota: { ...tipografia.nota, fontStyle: 'italic', marginTop: espaco.md },
  fechar: { marginTop: espaco.lg },
});
