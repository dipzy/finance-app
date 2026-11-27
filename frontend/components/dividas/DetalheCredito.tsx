import { StyleSheet, Text, View } from 'react-native';
import { cores, espaco, tipografia } from '../../constants/tema';
import { useT } from '../../i18n';
import type { DividaComEstado } from '../../services/database';
import { dataCurta, euro, formatarDuracao, percentagem, textoMes } from '../../utils/dividas';
import { Etiqueta } from '../ui';
import { Caixa, LinhaDado, SubTitulo } from './partes';

// O que se sabe de um crédito com taxa, por baixo do cartão da dívida: a próxima prestação (do extrato do
// credor), o que falta pagar e as contas do contrato (preço, entrada, juros). Cada bloco só aparece se há dados
export function DetalheCredito({ divida }: { divida: DividaComEstado }) {
  const t = useT();
  const { resumo, extrato } = divida;
  if (!resumo && !extrato) return null;

  const emAtraso = extrato?.emAtraso === true;

  return (
    <View style={styles.caixa}>
      {extrato && (
        <Caixa destaque={emAtraso ? cores.negativo : undefined}>
          <View style={styles.cabecalho}>
            <Text style={styles.titulo}>{t('Próxima prestação')}</Text>
            <Etiqueta
              texto={emAtraso ? t('Em atraso: {valor}', { valor: euro(extrato.capitalVencido ?? 0) }) : t('Em dia')}
              cor={emAtraso ? cores.negativo : cores.positivo}
            />
          </View>
          {extrato.prestacaoValor != null && (
            <LinhaDado
              forte
              rotulo={
                extrato.proximaPrestacaoNumero != null && extrato.prestacaoTotal != null
                  ? t('{n} de {total} · vence a {data}', {
                      n: extrato.proximaPrestacaoNumero,
                      total: extrato.prestacaoTotal,
                      data: dataCurta(extrato.vencimento),
                    })
                  : t('Vence a {data}', { data: dataCurta(extrato.vencimento) })
              }
              valor={euro(extrato.prestacaoValor)}
            />
          )}
          {extrato.prestacaoCapital != null && <LinhaDado rotulo={t('Capital')} valor={euro(extrato.prestacaoCapital)} />}
          {extrato.prestacaoJuros != null && <LinhaDado rotulo={t('Juros')} valor={euro(extrato.prestacaoJuros)} />}
          {!!extrato.prestacaoSelo && <LinhaDado rotulo={t('Imposto do selo')} valor={euro(extrato.prestacaoSelo)} />}
          {!!extrato.prestacaoSeguros && <LinhaDado rotulo={t('Seguros')} valor={euro(extrato.prestacaoSeguros)} />}
          <Text style={styles.nota}>{t('Segundo o extrato de {data}.', { data: dataCurta(extrato.emitidoEm) })}</Text>
        </Caixa>
      )}

      {resumo && (
        <>
          <SubTitulo>{t('O que falta')}</SubTitulo>
          {divida.taxaAnual !== undefined && <LinhaDado rotulo={t('Taxa (TAN)')} valor={percentagem(divida.taxaAnual)} />}
          {resumo.viavel ? (
            resumo.mesesRestantes != null && (
              <LinhaDado
                rotulo={t('Faltam')}
                valor={formatarDuracao(resumo.mesesRestantes)}
                nota={resumo.fim ? t('Acaba em {mes}', { mes: textoMes(resumo.fim) }) : undefined}
              />
            )
          ) : (
            <Text style={styles.aviso}>{t('A prestação não chega para pagar os juros: a dívida não desce.')}</Text>
          )}
          <LinhaDado rotulo={t('Juros que ainda vais pagar')} valor={euro(resumo.jurosRestantes)} />
          <LinhaDado
            rotulo={t('Total que ainda vais pagar')}
            valor={euro(resumo.totalRestante)}
            nota={t('Capital, juros, selo e seguros até ao fim')}
          />
          {resumo.pagoEmJurosEEncargos > 0 && (
            <LinhaDado
              rotulo={t('Já pago em juros, selo e seguros')}
              valor={euro(resumo.pagoEmJurosEEncargos)}
              nota={t('Desde que registaste a dívida')}
            />
          )}

          {(resumo.precoTotal != null || divida.entrada !== undefined) && (
            <>
              <SubTitulo>{t('O contrato')}</SubTitulo>
              {resumo.precoTotal != null && (
                <LinhaDado rotulo={t('Valor do bem')} valor={euro(resumo.precoTotal)} nota={t('Financiado mais entrada')} />
              )}
              {divida.entrada !== undefined && <LinhaDado rotulo={t('Entrada')} valor={euro(divida.entrada)} />}
              {divida.valorFinanciado !== undefined && <LinhaDado rotulo={t('Valor financiado')} valor={euro(divida.valorFinanciado)} />}
              {resumo.capitalAmortizado != null && (
                <LinhaDado rotulo={t('Já amortizado do financiado')} valor={euro(resumo.capitalAmortizado)} cor={cores.positivo} />
              )}
              {divida.prazoMeses !== undefined && <LinhaDado rotulo={t('Prazo')} valor={formatarDuracao(divida.prazoMeses)} />}
              {resumo.jurosContrato != null && (
                <LinhaDado rotulo={t('Juros do contrato (estimativa)')} valor={euro(resumo.jurosContrato)} />
              )}
              {resumo.custoTotalContrato != null && (
                <LinhaDado
                  rotulo={t('Custo total do contrato (estimativa)')}
                  valor={euro(resumo.custoTotalContrato)}
                  nota={t('Entrada, capital, juros, selo e seguros')}
                />
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caixa: { marginTop: espaco.xs },
  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  titulo: { ...tipografia.tituloCartao, fontSize: 15 },
  nota: { ...tipografia.nota, marginTop: 4 },
  aviso: { ...tipografia.secundario, color: cores.aviso, fontSize: 13, marginVertical: 4 },
});
