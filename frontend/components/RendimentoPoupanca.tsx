import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { comAlfa, cores, espaco, tipografia } from '../constants/tema';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../i18n';
import { Poupanca, PoupancasDB, ProjecaoPoupanca } from '../services/database';
import { parseValor } from '../utils/helpers';
import { CampoTexto, Chip, formatarEuro } from './ui';

// Daqui a quanto tempo se quer ver quanto vale a poupança
const PERIODOS = [
  { meses: 6, rotulo: '6 meses' },
  { meses: 12, rotulo: '1 ano' },
  { meses: 24, rotulo: '2 anos' },
  { meses: 60, rotulo: '5 anos' },
  { meses: 120, rotulo: '10 anos' },
];

const TRILHO = { false: comAlfa(cores.primaria, 0.5), true: comAlfa(cores.positivo, 0.5) };

const texto = (n: number | undefined) => (n === undefined ? '' : String(n).replace('.', ','));

interface Props {
  poupanca: Poupanca;
  // Guarda e volta a ler as poupanças (os juros automáticos mudam campos que só o servidor sabe)
  onGravar: (campos: Partial<Pick<Poupanca, 'taxaAnual' | 'retencao' | 'jurosAutomaticos'>>) => Promise<void>;
}

// O rendimento de uma poupança: a taxa anual, o imposto, se os juros se somam ao saldo sozinhos (conta poupança,
// certificados de aforro) ou só servem para estimar (PPR), quanto rende por mês e quanto vai valer daqui a X tempo
export function RendimentoPoupanca({ poupanca: p, onGravar }: Props) {
  const t = useT();
  const { user } = useAuth();
  const [taxa, setTaxa] = useState(texto(p.taxaAnual));
  const [retencao, setRetencao] = useState(texto(p.retencao ?? 28));
  const [simulada, setSimulada] = useState('');
  const [meses, setMeses] = useState(12);
  const [projecao, setProjecao] = useState<ProjecaoPoupanca | null>(null);
  const temTaxa = (p.taxaAnual ?? 0) > 0;
  const taxaSimulada = simulada.trim() ? parseValor(simulada) : undefined;

  useEffect(() => {
    if (!user?.id || (!temTaxa && taxaSimulada === undefined)) {
      setProjecao(null);
      return;
    }
    let atual = true;
    PoupancasDB.projecao(user.id, p.id, meses, taxaSimulada)
      .then((r) => atual && setProjecao(r))
      .catch(() => atual && setProjecao(null));
    return () => {
      atual = false;
    };
  }, [user?.id, p.id, p.taxaAnual, p.retencao, p.saldo, p.valor, p.tipo, meses, taxaSimulada, temTaxa]);

  function guardarTaxa() {
    const valor = taxa.trim() ? parseValor(taxa) : undefined;
    if (valor === p.taxaAnual || (valor === 0 && p.taxaAnual === undefined)) return;
    // Sem taxa deixa de haver juros automáticos (o servidor desliga-os ao limpar a taxa)
    onGravar({ taxaAnual: valor && valor > 0 ? valor : undefined });
  }

  function guardarRetencao() {
    const valor = retencao.trim() ? parseValor(retencao) : 0;
    if (valor !== (p.retencao ?? 28)) onGravar({ retencao: valor });
  }

  const periodo = PERIODOS.find((x) => x.meses === meses)?.rotulo ?? `${meses}`;

  return (
    <View style={styles.bloco}>
      <Text style={styles.titulo}>{t('Rendimento (opcional)')}</Text>
      <View style={styles.linha}>
        <CampoTexto
          estiloCaixa={styles.metade}
          rotulo={t('Taxa anual bruta (%)')}
          placeholder={t('ex: 2,5')}
          keyboardType="numeric"
          value={taxa}
          onChangeText={setTaxa}
          onBlur={guardarTaxa}
        />
        <CampoTexto
          estiloCaixa={styles.metade}
          rotulo={t('Imposto sobre os juros (%)')}
          placeholder="28"
          keyboardType="numeric"
          value={retencao}
          onChangeText={setRetencao}
          onBlur={guardarRetencao}
        />
      </View>

      <View style={styles.interruptor}>
        <View style={styles.interruptorTextos}>
          <Text style={styles.subtitulo}>{t('Somar os juros ao saldo')}</Text>
          <Text style={styles.nota}>
            {t('No fim de cada mês a app soma os juros ao saldo. Num PPR deixa desligado: o valor muda com o mercado e a taxa serve só para a simulação.')}
          </Text>
        </View>
        <Switch
          value={!!p.jurosAutomaticos}
          disabled={!temTaxa}
          onValueChange={(jurosAutomaticos) => onGravar({ jurosAutomaticos })}
          trackColor={TRILHO}
          thumbColor={cores.texto}
          accessibilityLabel={t('Somar os juros ao saldo')}
        />
      </View>

      {temTaxa && (
        <Text style={styles.resumo}>
          {t('Rende {valor} por mês (já sem imposto)', { valor: formatarEuro(p.jurosMes ?? 0) })}
          {p.jurosAutomaticos ? ` · ${t('Já somados: {valor}', { valor: formatarEuro(p.jurosRecebidos ?? 0) })}` : ''}
        </Text>
      )}

      <Text style={styles.subtitulo}>{t('Quanto vai valer (precisa da taxa anual)')}</Text>
      <View style={styles.periodos}>
        {PERIODOS.map((x) => (
          <Chip key={x.meses} rotulo={t(x.rotulo)} ativo={meses === x.meses} onPress={() => setMeses(x.meses)} />
        ))}
      </View>
      <CampoTexto
        rotulo={t('Simular outra taxa (%, opcional)')}
        placeholder={t('ex: 4')}
        keyboardType="numeric"
        value={simulada}
        onChangeText={setSimulada}
      />

      {projecao ? (
        <View style={styles.resultado}>
          <Text style={styles.resultadoTitulo}>{t('Daqui a {periodo}', { periodo: t(periodo) })}</Text>
          <Text style={styles.resultadoValor}>{formatarEuro(projecao.saldoFinal)}</Text>
          <Text style={styles.nota}>
            {t('Juros: +{juros} · Contribuições: +{contribuicoes} · Taxa: {taxa}%', {
              juros: formatarEuro(projecao.jurosLiquidos),
              contribuicoes: formatarEuro(projecao.contribuicoes),
              taxa: texto(projecao.taxaAnual),
            })}
          </Text>
          <Text style={styles.nota}>{t('É só uma estimativa: a taxa pode mudar e o rendimento real pode ser diferente.')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: { marginTop: espaco.lg, paddingTop: espaco.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  titulo: { ...tipografia.tituloCartao, marginBottom: espaco.sm },
  linha: { flexDirection: 'row', gap: espaco.sm },
  metade: { flex: 1 },
  interruptor: { flexDirection: 'row', alignItems: 'center', gap: espaco.md, marginVertical: espaco.sm },
  interruptorTextos: { flex: 1 },
  subtitulo: { ...tipografia.corpoMedio, marginBottom: 2 },
  nota: { ...tipografia.nota, marginBottom: espaco.xs },
  resumo: { ...tipografia.corpo, color: cores.positivo, marginBottom: espaco.md },
  periodos: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm, marginVertical: espaco.sm },
  resultado: { marginTop: espaco.sm, gap: 2 },
  resultadoTitulo: { ...tipografia.rotulo, fontSize: 11 },
  resultadoValor: { ...tipografia.valor, color: cores.positivo, fontSize: 22 },
});
