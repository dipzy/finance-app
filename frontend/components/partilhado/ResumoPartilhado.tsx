import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cores, espaco, fontes, tipografia } from '../../constants/tema';
import { useT } from '../../i18n';
import { ouvir } from '../../services/eventos';
import { PartilhadoDB, type ResumoPartilhadoDto } from '../../services/partilhado';
import { textoSaldo } from '../../utils/partilhado';
import { BarraProgresso } from '../BarraProgresso';
import { Cartao, formatarEuro, TituloSecao, ValorEuro } from '../ui';

const COR = cores.violetaTexto;

interface Props {
  /** O mês da minha parte e das contribuições (AAAA-MM); sem ele, o mês atual. */
  mes?: string;
  /** Início: só o essencial (sem a lista dos mealheiros). */
  compacto?: boolean;
}

// A parte partilhada no Início e no Resumo do mês: quanto tenho a receber e a pagar nos grupos, a
// minha parte das despesas partilhadas do mês (que já está nos gastos) e os mealheiros.
// Sem grupos não mostra nada
export function ResumoPartilhado({ mes, compacto }: Props) {
  const t = useT();
  const [resumo, setResumo] = useState<ResumoPartilhadoDto | null>(null);
  const ultimoPedido = useRef(0);

  const carregar = useCallback(async () => {
    const pedido = ++ultimoPedido.current;
    try {
      const lido = await PartilhadoDB.resumo(mes);
      if (pedido === ultimoPedido.current) setResumo(lido);
    } catch (error) {
      // O resto do ecrã aparece na mesma
      console.error('Erro ao carregar o resumo partilhado:', error);
    }
  }, [mes]);

  useFocusEffect(
    useCallback(() => {
      carregar();
      return ouvir('dadosMudaram', () => carregar());
    }, [carregar])
  );

  if (!resumo || (resumo.grupos.length === 0 && resumo.convitesPendentes === 0)) return null;

  const totalMealheiros = resumo.mealheiros.reduce((s, m) => s + m.saldo, 0);
  // O total do cabeçalho: o que está nos mealheiros mais o saldo líquido dos grupos
  const liquido = resumo.aReceber - resumo.aPagar + totalMealheiros;
  const comSaldo = resumo.grupos.filter((g) => Math.abs(g.meuSaldo) > 0.004);
  const abrir = (rota: string) => router.push(rota as Href);

  return (
    <Cartao acento={COR}>
      <TituloSecao
        titulo={t('Poupança conjunta')}
        icone="people-outline"
        cor={COR}
        direita={
          resumo.grupos.length > 0 ? (
            <ValorEuro valor={liquido} tipo="auto" prefixo={liquido > 0 ? '+' : ''} style={styles.total} />
          ) : undefined
        }
      />

      {resumo.convitesPendentes > 0 && (
        <Pressable onPress={() => abrir('/(tabs)/poupanca-partilhada')} accessibilityRole="button">
          <Text style={styles.convites}>
            {resumo.convitesPendentes === 1
              ? t('Tens 1 convite para um grupo')
              : t('Tens {n} convites para grupos', { n: resumo.convitesPendentes })}
          </Text>
        </Pressable>
      )}

      {resumo.grupos.length > 0 && (
        <>
          <View style={styles.linha}>
            <Text style={styles.rotulo}>{t('A receber')}</Text>
            <ValorEuro valor={resumo.aReceber} tipo={resumo.aReceber > 0 ? 'entrada' : 'neutro'} />
          </View>
          <View style={styles.linha}>
            <Text style={styles.rotulo}>{t('A pagar')}</Text>
            <ValorEuro valor={resumo.aPagar} tipo={resumo.aPagar > 0 ? 'saida' : 'neutro'} />
          </View>

          {comSaldo.map((g) => (
            <Pressable
              key={g.grupoId}
              onPress={() => abrir(`/(tabs)/grupo/${g.grupoId}`)}
              style={({ pressed }) => [styles.linha, pressed && styles.premido]}
              accessibilityRole="button"
            >
              <Text style={styles.grupo} numberOfLines={1}>
                {g.nome}
              </Text>
              <Text style={[styles.saldoGrupo, { color: g.meuSaldo > 0 ? cores.positivo : cores.negativo }]}>{textoSaldo(g.meuSaldo)}</Text>
            </Pressable>
          ))}

          {resumo.minhaParteMes > 0 && (
            <Text style={styles.nota}>
              {t('A tua parte das despesas partilhadas: {parte} (já conta nos teus gastos). Pagaste {pago} pelo grupo.', {
                parte: formatarEuro(resumo.minhaParteMes),
                pago: formatarEuro(resumo.pagoPorMimMes),
              })}
            </Text>
          )}
        </>
      )}

      {!compacto &&
        resumo.mealheiros.map((m) => (
          <View key={m.id} style={styles.mealheiro}>
            <View style={styles.linha}>
              <Text style={styles.grupo} numberOfLines={1}>
                {m.nome} <Text style={styles.nota}>· {m.grupoNome}</Text>
              </Text>
              <ValorEuro valor={m.saldo} cor={cores.aviso} />
            </View>
            {m.objetivo ? <BarraProgresso percentagem={(m.saldo / m.objetivo) * 100} cor={cores.aviso} altura={6} /> : null}
          </View>
        ))}

      {compacto && resumo.mealheiros.length > 0 && (
        <View style={styles.linha}>
          <Text style={styles.rotulo}>{t('Mealheiros')}</Text>
          <ValorEuro valor={totalMealheiros} cor={cores.aviso} />
        </View>
      )}

      <Pressable onPress={() => abrir('/(tabs)/poupanca-partilhada')} accessibilityRole="link" style={styles.ligacao}>
        <Text style={styles.ligacaoTexto}>{t('Abrir Poupança conjunta')}</Text>
      </Pressable>
    </Cartao>
  );
}

const styles = StyleSheet.create({
  total: { fontSize: 16 },
  linha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaco.sm, paddingVertical: 4 },
  rotulo: { ...tipografia.secundario },
  grupo: { ...tipografia.corpo, flexShrink: 1 },
  saldoGrupo: { ...tipografia.nota, fontSize: 13, fontFamily: fontes.corpoMedio },
  premido: { opacity: 0.7 },
  nota: { ...tipografia.nota, marginTop: espaco.xs },
  convites: { ...tipografia.corpoMedio, color: cores.aviso, marginBottom: espaco.sm },
  mealheiro: { marginTop: espaco.md },
  ligacao: { marginTop: espaco.md, alignSelf: 'flex-start' },
  ligacaoTexto: { ...tipografia.corpoMedio, color: cores.primaria, fontSize: 14 },
});
