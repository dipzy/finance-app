import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { cores, espaco, tipografia } from '../../constants/tema';
import { useT } from '../../i18n';
import { DividasApi } from '../../services/dividas';
import { mensagemDaApi } from '../../services/grupos';
import type { ComparacaoEstrategias, ResultadoEstrategia } from '../../services/tipos';
import { euro, melhorEstrategia, type NomeEstrategia, textoAcaba } from '../../utils/dividas';
import { parseValor } from '../../utils/formatos';
import { ModalFormulario, estilosFormulario } from '../ModalFormulario';
import { Botao, CampoTexto, Chip, Etiqueta } from '../ui';
import { Caixa, LinhaDado } from './partes';

const ATALHOS = [0, 50, 100, 200];

// Quando há várias dívidas: pagar só as prestações, a bola de neve (a mais pequena primeiro) ou a avalanche
// (a de taxa mais alta primeiro). O que é pago a mais, e as prestações das dívidas que vão ficando pagas,
// vão para a dívida da vez. Só conta as dívidas com prestação ligada
export function EstrategiasDividas({ visivel, onFechar }: { visivel: boolean; onFechar: () => void }) {
  const t = useT();
  const [extra, setExtra] = useState('50');
  const [resultado, setResultado] = useState<ComparacaoEstrategias | null>(null);
  const [aCalcular, setACalcular] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function comparar() {
    setACalcular(true);
    setErro(null);
    try {
      setResultado(await DividasApi.compararEstrategias(Math.max(0, parseValor(extra))));
    } catch (e) {
      setResultado(null);
      setErro(mensagemDaApi(e, t('Não foi possível comparar.')));
    } finally {
      setACalcular(false);
    }
  }

  const melhor = resultado ? melhorEstrategia(resultado) : null;
  const base = resultado?.soPrestacoes;

  return (
    <ModalFormulario visivel={visivel} titulo={t('Comparar estratégias')} onFechar={onFechar}>
      <Text style={estilosFormulario.nota}>
        {t('Quanto podes pagar a mais por mês, além das prestações? Compara as maneiras de o usar para acabar com as dívidas.')}
      </Text>
      <CampoTexto
        rotulo={t('Extra por mês (€)')}
        keyboardType="numeric"
        value={extra}
        onChangeText={setExtra}
      />
      <View style={styles.atalhos}>
        {ATALHOS.map((valor) => (
          <Chip key={valor} rotulo={`${valor} €`} onPress={() => setExtra(String(valor))} ativo={parseValor(extra) === valor} />
        ))}
      </View>
      <Botao
        titulo={aCalcular ? t('A calcular…') : t('Comparar')}
        icone="git-compare-outline"
        onPress={comparar}
        desativado={aCalcular}
        style={estilosFormulario.botaoPrincipal}
      />

      {aCalcular && !resultado && <ActivityIndicator color={cores.primaria} style={styles.carregar} />}
      {!!erro && <Text style={styles.erro}>{erro}</Text>}

      {resultado && base && (
        <View>
          {resultado.dividas.length === 0 ? (
            <Text style={styles.nota}>
              {t('Nenhuma dívida tem prestação ligada: liga a prestação (despesa fixa) às dívidas para as poder comparar.')}
            </Text>
          ) : (
            <>
              <Linha
                nome="soPrestacoes"
                titulo={t('Só as prestações')}
                descricao={t('Cada dívida paga a sua prestação e nada mais.')}
                r={resultado.soPrestacoes}
                base={base}
                melhor={melhor}
              />
              <Linha
                nome="bolaDeNeve"
                titulo={t('Bola de neve')}
                descricao={t('O extra vai para a dívida mais pequena: acabas dívidas mais depressa e ganhas ânimo.')}
                r={resultado.bolaDeNeve}
                base={base}
                melhor={melhor}
              />
              <Linha
                nome="avalanche"
                titulo={t('Avalanche')}
                descricao={t('O extra vai para a dívida com a taxa mais alta: é a que costuma poupar mais em juros.')}
                r={resultado.avalanche}
                base={base}
                melhor={melhor}
              />
            </>
          )}
          {resultado.ignoradas.length > 0 && (
            <Text style={styles.nota}>{t('Ficaram de fora (sem prestação ligada ou já pagas): {lista}', { lista: resultado.ignoradas.join(', ') })}</Text>
          )}
        </View>
      )}

      <Botao variante="fantasma" titulo={t('Fechar')} onPress={onFechar} style={styles.fechar} />
    </ModalFormulario>
  );
}

function Linha({
  nome,
  titulo,
  descricao,
  r,
  base,
  melhor,
}: {
  nome: NomeEstrategia;
  titulo: string;
  descricao: string;
  r: ResultadoEstrategia;
  base: ResultadoEstrategia;
  melhor: NomeEstrategia | null;
}) {
  const t = useT();
  const eMelhor = nome === melhor && nome !== 'soPrestacoes';
  const poupaJuros = base.viavel && r.viavel ? base.juros - r.juros : 0;
  const mesesPoupados = base.viavel && r.viavel ? base.meses - r.meses : 0;
  return (
    <Caixa destaque={eMelhor ? cores.positivo : undefined}>
      <View style={styles.cabecalho}>
        <Text style={styles.titulo}>{titulo}</Text>
        {eMelhor && <Etiqueta texto={t('A melhor')} cor={cores.positivo} icone="trophy-outline" />}
      </View>
      <Text style={styles.descricao}>{descricao}</Text>
      <LinhaDado rotulo={t('Ficas sem dívidas')} valor={textoAcaba(r)} />
      <LinhaDado rotulo={t('Juros até ao fim')} valor={r.viavel ? euro(r.juros) : '—'} />
      {nome !== 'soPrestacoes' && poupaJuros > 0 && (
        <LinhaDado
          forte
          rotulo={t('Poupas em juros')}
          valor={euro(poupaJuros)}
          cor={cores.positivo}
          nota={mesesPoupados > 0 ? t('E acabas {n} meses mais cedo', { n: mesesPoupados }) : undefined}
        />
      )}
      {r.ordem.length > 1 && (
        <Text style={styles.ordem}>
          {t('Ordem: {lista}', { lista: r.ordem.map((o) => `${o.titulo} (${t('mês {n}', { n: o.mes })})`).join(' → ') })}
        </Text>
      )}
    </Caixa>
  );
}

const styles = StyleSheet.create({
  atalhos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: espaco.md },
  carregar: { marginVertical: espaco.lg },
  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  titulo: { ...tipografia.tituloCartao, fontSize: 15 },
  descricao: { ...tipografia.nota, marginBottom: 6 },
  ordem: { ...tipografia.nota, marginTop: 6 },
  erro: { ...tipografia.secundario, color: cores.negativo, fontSize: 13, marginTop: espaco.sm },
  nota: { ...tipografia.nota, fontStyle: 'italic', marginTop: espaco.md },
  fechar: { marginTop: espaco.lg },
});
