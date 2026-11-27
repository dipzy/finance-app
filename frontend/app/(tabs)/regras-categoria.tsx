import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Header } from '../../components/Header';
import { estilosFormulario, ModalFormulario } from '../../components/ModalFormulario';
import { SeletorCategoria } from '../../components/SeletorCategoria';
import { SideMenu } from '../../components/SideMenu';
import { Botao, CampoTexto, Cartao, Ecra, Etiqueta, TituloSecao } from '../../components/ui';
import { comAlfa, cores, espaco, fontes, layout, tipografia } from '../../constants/tema';
import { t, useT } from '../../i18n';
import {
  jaExiste,
  lerPrioridade,
  mensagemDeRegra,
  ordenarRegras,
  RegraCategoria,
  RegraPadrao,
  RegrasDB,
  textoOrigemSugestao,
} from '../../services/regras';
import type { Categoria, SugestaoCategoria } from '../../services/tipos';
import { infoCategoria, nomeCategoria } from '../../utils/categorias';
import { confirmar } from '../../utils/confirmar';
import { mostrarAlerta } from '../../utils/helpers';

// Regras de categorização (aberto a partir das Definições; sem entrada no menu): "se a descrição de um
// gasto contiver este texto, a categoria é esta". As do utilizador ganham às padrão (que vêm com a app,
// só de leitura, e se podem copiar para as do utilizador). Quem aplica as regras é a API: ao registar
// gastos sem categoria e ao importar do Excel.

interface Formulario {
  id: string | null; // null = regra nova
  texto: string;
  categoria: Categoria | undefined;
  prioridade: string;
  ativa: boolean;
}

const FORMULARIO_VAZIO: Formulario = { id: null, texto: '', categoria: undefined, prioridade: '', ativa: true };

const descreverOrigem = (s: SugestaoCategoria): string =>
  textoOrigemSugestao(s) ??
  (s.origem === 'historico'
    ? t('Pelo histórico deste título')
    : s.origem === 'palavra-chave'
      ? t('Por uma palavra-chave')
      : t('Sem regra: fica em Outros'));

export default function RegrasCategoriaScreen() {
  const t = useT();
  const [menuVisible, setMenuVisible] = useState(false);
  const [regras, setRegras] = useState<RegraCategoria[] | null>(null);
  const [padrao, setPadrao] = useState<RegraPadrao[]>([]);
  const [erro, setErro] = useState(false);
  const [verPadrao, setVerPadrao] = useState(false);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [aGuardar, setAGuardar] = useState(false);
  const [aCopiar, setACopiar] = useState<string | null>(null);
  const [experiencia, setExperiencia] = useState('');
  const [resultado, setResultado] = useState<SugestaoCategoria | null | undefined>(undefined);

  const carregar = useCallback(async () => {
    try {
      const [minhas, deOrigem] = await Promise.all([RegrasDB.listar(), RegrasDB.padrao().catch(() => [] as RegraPadrao[])]);
      setRegras(ordenarRegras(minhas));
      setPadrao(deOrigem);
      setErro(false);
    } catch (error) {
      console.error('Erro ao carregar as regras de categorização:', error);
      setErro(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void carregar();
    }, [carregar])
  );

  function nova(texto = '', categoria?: Categoria) {
    setFormulario({ ...FORMULARIO_VAZIO, texto, categoria });
  }

  function editar(regra: RegraCategoria) {
    setFormulario({
      id: regra.id,
      texto: regra.texto,
      categoria: regra.categoria,
      prioridade: regra.prioridade === 0 ? '' : String(regra.prioridade),
      ativa: regra.ativa,
    });
  }

  async function guardar() {
    if (!formulario) return;
    const texto = formulario.texto.trim();
    const prioridade = lerPrioridade(formulario.prioridade);
    if (!texto) return mostrarAlerta(t('Erro'), t('Escreve o texto a procurar (ex.: Continente).'));
    if (!formulario.categoria) return mostrarAlerta(t('Erro'), t('Escolhe a categoria da regra.'));
    if (prioridade === null) return mostrarAlerta(t('Erro'), t('A prioridade é um número inteiro entre -1000 e 1000.'));
    if (jaExiste(regras ?? [], texto, formulario.id ?? undefined)) {
      return mostrarAlerta(t('Erro'), t('Já tens uma regra com este texto.'));
    }

    setAGuardar(true);
    try {
      const corpo = { texto, categoria: formulario.categoria, ativa: formulario.ativa, prioridade };
      if (formulario.id) await RegrasDB.alterar(formulario.id, corpo);
      else await RegrasDB.criar(corpo);
      setFormulario(null);
      await carregar();
    } catch (error) {
      console.error('Erro ao guardar a regra:', error);
      mostrarAlerta(t('Erro'), mensagemDeRegra(error));
    } finally {
      setAGuardar(false);
    }
  }

  async function alternar(regra: RegraCategoria, ativa: boolean) {
    // Mostra já a mudança; se a API recusar, volta atrás
    setRegras((antes) => antes?.map((r) => (r.id === regra.id ? { ...r, ativa } : r)) ?? null);
    try {
      await RegrasDB.alterar(regra.id, { texto: regra.texto, categoria: regra.categoria, ativa, prioridade: regra.prioridade });
      await carregar();
    } catch (error) {
      console.error('Erro ao ativar/desativar a regra:', error);
      mostrarAlerta(t('Erro'), mensagemDeRegra(error));
      await carregar();
    }
  }

  async function apagar(regra: RegraCategoria) {
    const sim = await confirmar(
      t('Apagar regra'),
      t('Apagar a regra "{texto}"? Os gastos já registados não mudam de categoria.', { texto: regra.texto }),
      'Apagar'
    );
    if (!sim) return;
    try {
      await RegrasDB.remover(regra.id);
      await carregar();
    } catch (error) {
      console.error('Erro ao apagar a regra:', error);
      mostrarAlerta(t('Erro'), mensagemDeRegra(error));
    }
  }

  async function copiar(regra: RegraPadrao) {
    setACopiar(regra.texto);
    try {
      await RegrasDB.criar({ texto: regra.texto, categoria: regra.categoria, ativa: true, prioridade: 0 });
      await carregar();
    } catch (error) {
      console.error('Erro ao copiar a regra padrão:', error);
      mostrarAlerta(t('Erro'), mensagemDeRegra(error));
    } finally {
      setACopiar(null);
    }
  }

  async function experimentar() {
    if (!experiencia.trim()) return;
    try {
      setResultado(await RegrasDB.sugerir(experiencia));
    } catch (error) {
      console.error('Erro ao experimentar a descrição:', error);
      setResultado(null);
    }
  }

  return (
    <Ecra
      cabecalho={
        <>
          <Header title={t('Regras de categorização')} onMenuPress={() => setMenuVisible(true)} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} />
        </>
      }
    >
      <Botao
        variante="fantasma"
        pequeno
        icone="arrow-back"
        titulo={t('Definições')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/definicoes' as Href))}
        style={styles.voltar}
      />
      <Text style={styles.ajuda}>
        {t('Quando o título de um gasto contém o texto de uma regra (sem maiúsculas nem acentos), a categoria é a da regra. Vale também ao importar do Excel.')}
      </Text>

      <Cartao>
        <TituloSecao titulo={t('As minhas regras')} icone="git-branch-outline" />
        {regras === null && !erro && <ActivityIndicator color={cores.primaria} style={styles.estado} />}
        {erro && (
          <View style={styles.estado}>
            <Text style={styles.vazio}>{t('Não foi possível carregar as regras.')}</Text>
            <Botao variante="secundario" pequeno icone="refresh-outline" titulo={t('Tentar outra vez')} onPress={carregar} />
          </View>
        )}
        {regras?.length === 0 && (
          <Text style={styles.vazio}>{t('Ainda não tens regras. Cria uma ou copia das regras padrão.')}</Text>
        )}
        {regras?.map((regra, i) => {
          const info = infoCategoria(regra.categoria);
          return (
            <View key={regra.id} style={[styles.regra, i > 0 && styles.regraSeparada, !regra.ativa && styles.regraInativa]}>
              <View style={styles.regraTextos}>
                <Text style={styles.regraTexto} numberOfLines={2}>
                  {regra.texto}
                </Text>
                <View style={styles.regraDetalhe}>
                  <Ionicons name="arrow-forward" size={12} color={cores.textoMudo} accessibilityElementsHidden importantForAccessibility="no" />
                  <Ionicons name={info.icone} size={14} color={info.cor} accessibilityElementsHidden importantForAccessibility="no" />
                  <Text style={styles.regraCategoria}>{nomeCategoria(regra.categoria)}</Text>
                  {regra.prioridade !== 0 && (
                    <Text style={styles.regraNota}>{t('· prioridade {n}', { n: regra.prioridade })}</Text>
                  )}
                </View>
              </View>
              <Switch
                value={regra.ativa}
                onValueChange={(v) => alternar(regra, v)}
                accessibilityLabel={t('Regra {texto} ativa', { texto: regra.texto })}
                trackColor={{ false: cores.bordaForte, true: comAlfa(cores.primaria, 0.55) }}
                thumbColor={regra.ativa ? cores.primaria : cores.textoSecundario}
                ios_backgroundColor={cores.bordaForte}
              />
              <Pressable
                onPress={() => editar(regra)}
                style={styles.icone}
                accessibilityRole="button"
                accessibilityLabel={t('Editar a regra {texto}', { texto: regra.texto })}
              >
                <Ionicons name="create-outline" size={20} color={cores.textoSecundario} />
              </Pressable>
              <Pressable
                onPress={() => apagar(regra)}
                style={styles.icone}
                accessibilityRole="button"
                accessibilityLabel={t('Apagar a regra {texto}', { texto: regra.texto })}
              >
                <Ionicons name="trash-outline" size={20} color={cores.negativo} />
              </Pressable>
            </View>
          );
        })}
        <Botao titulo={t('Nova regra')} icone="add" onPress={() => nova()} style={styles.botao} />
      </Cartao>

      <Cartao>
        <TituloSecao titulo={t('Experimentar')} icone="flask-outline" />
        <CampoTexto
          rotulo={t('Título de um gasto')}
          value={experiencia}
          onChangeText={(texto) => {
            setExperiencia(texto);
            setResultado(undefined);
          }}
          placeholder={t('Ex: Continente Matosinhos')}
          returnKeyType="done"
          onSubmitEditing={experimentar}
        />
        <Botao titulo={t('Ver categoria')} variante="secundario" pequeno icone="search-outline" onPress={experimentar} desativado={!experiencia.trim()} />
        {resultado === null && <Text style={styles.nota}>{t('Não foi possível experimentar agora.')}</Text>}
        {resultado && (
          <Text style={styles.resultado} accessibilityLiveRegion="polite">
            {t('Categoria: {categoria}', { categoria: nomeCategoria(resultado.categoria) })} · {descreverOrigem(resultado)}
          </Text>
        )}
      </Cartao>

      <Cartao>
        <Pressable
          onPress={() => setVerPadrao((v) => !v)}
          style={styles.cabecalhoPadrao}
          accessibilityRole="button"
          accessibilityState={{ expanded: verPadrao }}
          accessibilityLabel={t('Regras padrão ({n})', { n: padrao.length })}
        >
          <TituloSecao titulo={t('Regras padrão ({n})', { n: padrao.length })} icone="library-outline" />
          <Ionicons name={verPadrao ? 'chevron-up' : 'chevron-down'} size={18} color={cores.textoMudo} />
        </Pressable>
        <Text style={styles.nota}>
          {t('Vêm com a app e não se alteram. As tuas regras ganham-lhes. Copia uma para a poderes mudar.')}
        </Text>
        {verPadrao &&
          padrao.map((regra, i) => {
            const info = infoCategoria(regra.categoria);
            const tenho = jaExiste(regras ?? [], regra.texto);
            return (
              <View key={regra.texto} style={[styles.regra, i > 0 && styles.regraSeparada]}>
                <View style={styles.regraTextos}>
                  <Text style={styles.regraTexto}>{regra.texto}</Text>
                  <View style={styles.regraDetalhe}>
                    <Ionicons name="arrow-forward" size={12} color={cores.textoMudo} accessibilityElementsHidden importantForAccessibility="no" />
                    <Ionicons name={info.icone} size={14} color={info.cor} accessibilityElementsHidden importantForAccessibility="no" />
                    <Text style={styles.regraCategoria}>{nomeCategoria(regra.categoria)}</Text>
                  </View>
                </View>
                {tenho ? (
                  <Etiqueta texto={t('Já tens')} cor={cores.positivo} icone="checkmark-circle-outline" />
                ) : (
                  <Botao
                    titulo={t('Copiar para as minhas')}
                    variante="secundario"
                    pequeno
                    icone="copy-outline"
                    onPress={() => copiar(regra)}
                    aCarregar={aCopiar === regra.texto}
                    desativado={aCopiar !== null}
                    accessibilityLabel={t('Copiar a regra {texto} para as minhas', { texto: regra.texto })}
                  />
                )}
              </View>
            );
          })}
        {verPadrao && padrao.length === 0 && <Text style={styles.vazio}>{t('Sem regras padrão para mostrar.')}</Text>}
      </Cartao>

      <ModalFormulario
        visivel={formulario !== null}
        titulo={formulario?.id ? t('Editar regra') : t('Nova regra')}
        onFechar={() => setFormulario(null)}
      >
        {formulario && (
          <>
            <CampoTexto
              rotulo={t('Se o título contiver')}
              value={formulario.texto}
              onChangeText={(texto) => setFormulario({ ...formulario, texto })}
              placeholder={t('Ex: Continente')}
              maxLength={100}
              autoFocus
            />
            <SeletorCategoria
              rotulo="Categoria"
              valor={formulario.categoria}
              onChange={(categoria) => setFormulario({ ...formulario, categoria })}
            />
            <CampoTexto
              rotulo={t('Prioridade (opcional)')}
              value={formulario.prioridade}
              onChangeText={(prioridade) => setFormulario({ ...formulario, prioridade })}
              placeholder="0"
              keyboardType="numbers-and-punctuation"
              accessibilityHint={t('Se duas regras servirem, ganha a de número maior')}
            />
            <Text style={estilosFormulario.nota}>{t('Se duas regras servirem, ganha a de prioridade maior (de -1000 a 1000).')}</Text>
            <View style={styles.linhaAtiva}>
              <Text style={styles.regraTexto}>{t('Regra ativa')}</Text>
              <Switch
                value={formulario.ativa}
                onValueChange={(ativa) => setFormulario({ ...formulario, ativa })}
                accessibilityLabel={t('Regra ativa')}
                trackColor={{ false: cores.bordaForte, true: comAlfa(cores.primaria, 0.55) }}
                thumbColor={formulario.ativa ? cores.primaria : cores.textoSecundario}
                ios_backgroundColor={cores.bordaForte}
              />
            </View>
            <Botao
              titulo={aGuardar ? t('A guardar…') : t('Guardar')}
              icone="checkmark"
              onPress={guardar}
              aCarregar={aGuardar}
              desativado={aGuardar}
              style={estilosFormulario.botaoPrincipal}
            />
            <Botao titulo={t('Cancelar')} variante="fantasma" onPress={() => setFormulario(null)} />
          </>
        )}
      </ModalFormulario>
    </Ecra>
  );
}

const styles = StyleSheet.create({
  voltar: { alignSelf: 'flex-start', marginTop: espaco.md },
  ajuda: { ...tipografia.nota, color: cores.textoSecundario, marginBottom: espaco.md },
  estado: { padding: espaco.lg, alignItems: 'center' },
  vazio: { ...tipografia.secundario, textAlign: 'center', fontStyle: 'italic', padding: espaco.md },
  nota: { ...tipografia.nota, marginTop: espaco.sm },
  resultado: { ...tipografia.corpoMedio, marginTop: espaco.md },
  botao: { marginTop: espaco.md },
  regra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    minHeight: 56,
    paddingVertical: espaco.sm,
  },
  regraSeparada: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cores.borda },
  regraInativa: { opacity: 0.6 },
  regraTextos: { flex: 1 },
  regraTexto: { fontFamily: fontes.corpoMedio, fontSize: 15, color: cores.texto },
  regraDetalhe: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, flexWrap: 'wrap' },
  regraCategoria: { ...tipografia.nota, color: cores.textoSecundario },
  regraNota: { ...tipografia.nota },
  icone: { width: layout.alvoToque, height: layout.alvoToque, alignItems: 'center', justifyContent: 'center' },
  cabecalhoPadrao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: layout.alvoToque },
  linhaAtiva: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espaco.lg },
});
