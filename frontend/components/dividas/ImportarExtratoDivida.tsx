import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { cores, espaco, tipografia } from '../../constants/tema';
import { useT } from '../../i18n';
import type { Despesa, DividaComEstado } from '../../services/database';
import { DividasApi } from '../../services/dividas';
import { mensagemDaApi } from '../../services/grupos';
import type { ExtratoLido } from '../../services/tipos';
import { bytesParaBase64, dataCurta, euro, percentagem } from '../../utils/dividas';
import { lerFicheiro } from '../../utils/lerFicheiro';
import { ModalFormulario, estilosFormulario } from '../ModalFormulario';
import { Botao, CampoTexto, Chip, Etiqueta } from '../ui';
import { Caixa, LinhaDado, SubTitulo } from './partes';

// Importar o extrato em PDF que o credor envia (ex.: o do Montepio Crédito ou da Cofidis): lê o contrato, o capital que falta
// e a próxima prestação, e atualiza a dívida (ou cria uma nova). O PDF é lido na API e não fica guardado;
// o nome, a morada, o NIF e o IBAN que vêm no PDF nem chegam à app
export function ImportarExtratoDivida({
  visivel,
  dividas,
  prestacoes,
  onFechar,
  onAplicado,
}: {
  visivel: boolean;
  dividas: DividaComEstado[];
  prestacoes: Despesa[];
  onFechar: () => void;
  onAplicado: () => void;
}) {
  const t = useT();
  const [lido, setLido] = useState<ExtratoLido | null>(null);
  const [nomeFicheiro, setNomeFicheiro] = useState('');
  const [aLer, setALer] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // null = criar uma dívida nova
  const [dividaId, setDividaId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
  const [fixaId, setFixaId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (visivel) {
      setLido(null);
      setNomeFicheiro('');
      setErro(null);
      setDividaId(null);
      setTitulo('');
      setFixaId(undefined);
    }
  }, [visivel]);

  async function escolher() {
    setErro(null);
    try {
      const escolha = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true, multiple: false });
      if (escolha.canceled || !escolha.assets?.length) return;
      const asset = escolha.assets[0];
      setALer(true);
      const resposta = await DividasApi.lerExtrato(bytesParaBase64(await lerFicheiro(asset)));
      const existente = dividas.find((d) => d.id === resposta.dividaId);
      // A API não envia os campos vazios: sem dívida do mesmo contrato, dividaId fica undefined
      const dividaDoContrato = resposta.dividaId ?? null;
      setNomeFicheiro(asset.name);
      setLido(resposta);
      setDividaId(dividaDoContrato);
      setTitulo(resposta.dividaTitulo ?? t('Crédito {numero}', { numero: resposta.extrato.numeroContrato }));
      setFixaId(existente?.fixaId);
    } catch (e) {
      setLido(null);
      setErro(mensagemDaApi(e, t('Não foi possível ler o PDF.')));
    } finally {
      setALer(false);
    }
  }

  async function aplicar() {
    if (!lido) return;
    setAGuardar(true);
    setErro(null);
    try {
      await DividasApi.aplicarExtrato({
        extrato: lido.extrato,
        dividaId: dividaId ?? undefined,
        titulo: dividaId ? undefined : titulo.trim() || undefined,
        fixaId,
      });
      onAplicado();
    } catch (e) {
      setErro(mensagemDaApi(e, t('Não foi possível guardar o extrato.')));
    } finally {
      setAGuardar(false);
    }
  }

  const e = lido?.extrato;
  const capitalEmDivida = e ? e.capitalVencido + e.capitalVincendo : 0;

  return (
    <ModalFormulario visivel={visivel} titulo={t('Importar extrato do crédito')} onFechar={onFechar}>
      {!e && (
        <Text style={estilosFormulario.nota}>
          {t('Escolhe o PDF do extrato que o credor te envia. Leio o contrato, o capital em dívida e a próxima prestação. O PDF não fica guardado e os teus dados pessoais (nome, morada, NIF, IBAN) não são usados.')}
        </Text>
      )}

      {!e && (
        <Botao
          titulo={aLer ? t('A ler o PDF…') : t('Escolher PDF')}
          icone="document-attach-outline"
          onPress={escolher}
          desativado={aLer}
          style={estilosFormulario.botaoPrincipal}
        />
      )}
      {aLer && <ActivityIndicator color={cores.primaria} style={styles.carregar} />}

      {e && (
        <View>
          <Text style={styles.ficheiro}>{nomeFicheiro}</Text>
          <Caixa>
            <View style={styles.cabecalho}>
              <Text style={styles.titulo}>{e.credor}</Text>
              <Etiqueta texto={e.numeroContrato} />
            </View>
            {!!e.categoria && <Text style={styles.categoria}>{e.categoria}</Text>}
            <LinhaDado rotulo={t('Taxa (TAN)')} valor={percentagem(e.taxaAnual)} />
            <LinhaDado rotulo={t('Capital inicial')} valor={euro(e.capitalInicial)} />
            <LinhaDado rotulo={t('Já amortizado')} valor={euro(e.capitalAmortizado)} cor={cores.positivo} />
            <LinhaDado rotulo={t('Capital em dívida')} valor={euro(capitalEmDivida)} forte />
            {e.capitalVencido > 0 && (
              <LinhaDado rotulo={t('Em atraso')} valor={euro(e.capitalVencido)} cor={cores.negativo} />
            )}
          </Caixa>

          <SubTitulo>{t('Próxima prestação')}</SubTitulo>
          <Caixa>
            <LinhaDado
              forte
              rotulo={t('{n} de {total} · vence a {data}', { n: e.prestacaoNumero, total: e.prestacaoTotal, data: dataCurta(e.vencimento) })}
              valor={euro(e.prestacaoValor)}
            />
            <LinhaDado rotulo={t('Capital')} valor={euro(e.prestacaoCapital)} />
            <LinhaDado rotulo={t('Juros')} valor={euro(e.prestacaoJuros)} />
            <LinhaDado rotulo={t('Imposto do selo')} valor={euro(e.prestacaoSelo)} />
            <LinhaDado rotulo={t('Seguros')} valor={euro(e.prestacaoSeguros)} />
            <Text style={styles.nota}>{t('Extrato emitido a {data}.', { data: dataCurta(e.emitidoEm) })}</Text>
          </Caixa>

          {e.avisos.map((aviso) => (
            <Text key={aviso} style={styles.aviso}>
              {aviso}
            </Text>
          ))}

          <SubTitulo>{t('Guardar em')}</SubTitulo>
          <View style={styles.opcoes}>
            {dividas.map((d) => (
              <Chip
                key={d.id}
                rotulo={d.id === lido?.dividaId ? t('{titulo} (mesmo contrato)', { titulo: d.titulo }) : d.titulo}
                ativo={dividaId === d.id}
                onPress={() => {
                  setDividaId(d.id);
                  setFixaId(d.fixaId);
                }}
              />
            ))}
            <Chip rotulo={t('Nova dívida')} ativo={dividaId === null} onPress={() => setDividaId(null)} />
          </View>
          {dividaId === null && (
            <CampoTexto rotulo={t('Nome da dívida')} value={titulo} onChangeText={setTitulo} placeholder={t('Ex.: Crédito pessoal')} />
          )}

          <SubTitulo>{t('Prestação (despesa fixa que paga esta dívida)')}</SubTitulo>
          <View style={styles.opcoes}>
            <Chip rotulo={t('Nenhuma')} ativo={!fixaId} onPress={() => setFixaId(undefined)} />
            {prestacoes.map((p) => (
              <Chip
                key={p.id}
                rotulo={t('{titulo} ({valor} €)', { titulo: p.titulo, valor: p.valor.toFixed(2) })}
                ativo={fixaId === p.id}
                onPress={() => setFixaId(p.id)}
              />
            ))}
          </View>
          <Text style={styles.nota}>
            {t('Com a prestação ligada, o capital desce sozinho a cada pagamento e dá para simular amortizações.')}
          </Text>
        </View>
      )}

      {!!erro && <Text style={styles.erro}>{erro}</Text>}

      {e && (
        <View style={[estilosFormulario.linhaBotoes, styles.botoes]}>
          <Botao
            titulo={aGuardar ? t('A guardar…') : dividaId ? t('Atualizar dívida') : t('Criar dívida')}
            icone="checkmark"
            onPress={aplicar}
            desativado={aGuardar || (dividaId === null && !titulo.trim())}
            style={estilosFormulario.botaoLinha}
          />
          <Botao variante="secundario" titulo={t('Outro PDF')} onPress={escolher} desativado={aGuardar || aLer} style={estilosFormulario.botaoLinha} />
        </View>
      )}
      <Botao variante="fantasma" titulo={t('Cancelar')} onPress={onFechar} style={styles.cancelar} />
    </ModalFormulario>
  );
}

const styles = StyleSheet.create({
  carregar: { marginVertical: espaco.lg },
  ficheiro: { ...tipografia.nota, marginBottom: 2 },
  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  titulo: { ...tipografia.tituloCartao, fontSize: 15, flex: 1, marginRight: espaco.sm },
  categoria: { ...tipografia.nota, marginBottom: 4 },
  nota: { ...tipografia.nota, marginTop: 4 },
  aviso: { ...tipografia.secundario, color: cores.aviso, fontSize: 13, marginTop: espaco.sm },
  erro: { ...tipografia.secundario, color: cores.negativo, fontSize: 13, marginTop: espaco.sm },
  opcoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: espaco.md },
  botoes: { marginTop: espaco.lg },
  cancelar: { marginTop: espaco.sm },
});
