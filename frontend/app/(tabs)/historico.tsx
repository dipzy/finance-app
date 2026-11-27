import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Header } from '../../components/Header';
import { SideMenu } from '../../components/SideMenu';
import { Botao, Chip, Ecra } from '../../components/ui';
import { cores, espaco, raio, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';
import {
  AlteracoesDB,
  carregarContextoNomes,
  ContextoNomes,
  ehDoSistema,
  FILTROS_ALTERACOES,
  FiltroAlteracoes,
  fraseAlteracao,
  linhasDetalhe,
  ordenarRegistos,
  precisaDeNomes,
  quandoCurto,
  RegistoAlteracao,
} from '../../services/alteracoes';

// Histórico de alterações (aberto a partir das Definições; sem entrada no menu): o que foi criado,
// alterado ou apagado, do mais recente para o mais antigo, com filtros por tipo (gastos, compromissos,
// planeamento, grupos, despesas partilhadas e poupança partilhada). Tocar numa linha mostra os
// detalhes; nos registos dos grupos, as pessoas aparecem com o nome e o email do membro ("Utilizador
// removido" para quem apagou a conta)
const ICONES = { criada: 'add-circle-outline', alterada: 'create-outline', apagada: 'trash-outline' } as const;
const CORES = { criada: cores.positivo, alterada: cores.primaria, apagada: cores.negativo };

export default function HistoricoScreen() {
  const { user } = useAuth();
  const t = useT();
  const [menuVisible, setMenuVisible] = useState(false);
  const [itens, setItens] = useState<RegistoAlteracao[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState(false);
  const [aberto, setAberto] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroAlteracoes>(FILTROS_ALTERACOES[0]);
  const [nomes, setNomes] = useState<ContextoNomes>({ meuId: user?.id });
  const nomesPedidos = useRef(false);
  // Só vale a resposta do último pedido (mudar de filtro a meio não mistura listas)
  const ultimoPedido = useRef(0);

  const carregar = useCallback(
    async (numero: number, doFiltro: FiltroAlteracoes = filtro) => {
      if (!user?.id) return;
      const pedido = ++ultimoPedido.current;
      setACarregar(true);
      try {
        const resposta = await AlteracoesDB.listarFiltrado(doFiltro, numero);
        if (pedido !== ultimoPedido.current) return;
        setItens((antes) => ordenarRegistos(numero > 1 && antes ? [...antes, ...resposta.itens] : resposta.itens));
        setTotal(resposta.total);
        setPagina(numero);
        setErro(false);
      } catch (error) {
        if (pedido !== ultimoPedido.current) return;
        console.error('Erro ao carregar o histórico:', error);
        setErro(true);
      } finally {
        if (pedido === ultimoPedido.current) setACarregar(false);
      }
    },
    [user?.id, filtro]
  );

  function escolherFiltro(novo: FiltroAlteracoes) {
    if (novo.chave === filtro.chave) return;
    setFiltro(novo);
    setItens(null);
    setAberto(null);
    setErro(false);
    carregar(1, novo);
  }

  // Quando há registos de grupos: ler (uma só vez) os nomes dos membros para mostrar quem é quem
  useEffect(() => {
    if (nomesPedidos.current || !itens?.some(precisaDeNomes)) return;
    nomesPedidos.current = true;
    carregarContextoNomes(user?.id).then(setNomes);
  }, [itens, user?.id]);

  useFocusEffect(
    useCallback(() => {
      carregar(1);
    }, [carregar])
  );

  return (
    <Ecra
      cabecalho={
        <>
          <Header title={t('Histórico de alterações')} onMenuPress={() => setMenuVisible(true)} />
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
      <Text style={styles.ajuda}>{t('Guarda-se o último ano. Toca numa linha para ver o que mudou.')}</Text>
      <View style={styles.filtros}>
        {FILTROS_ALTERACOES.map((f) => (
          <Chip
            key={f.chave}
            rotulo={f.rotulo}
            ativo={f.chave === filtro.chave}
            onPress={() => escolherFiltro(f)}
            accessibilityLabel={t('Filtrar: {tipo}', { tipo: t(f.rotulo) })}
          />
        ))}
      </View>

      {itens === null && !erro && <ActivityIndicator style={styles.estado} color={cores.primaria} />}
      {erro && (
        <View style={styles.estado}>
          <Text style={styles.vazio}>{t('Não foi possível carregar o histórico.')}</Text>
          <Botao variante="secundario" pequeno icone="refresh-outline" titulo={t('Tentar outra vez')} onPress={() => carregar(1)} />
        </View>
      )}

      {itens?.map((registo) => {
        const detalhes = linhasDetalhe(registo, nomes);
        const expandido = aberto === registo.id;
        return (
          <Pressable
            key={registo.id}
            style={styles.item}
            onPress={() => setAberto(expandido ? null : registo.id)}
            accessibilityRole="button"
            accessibilityState={{ expanded: expandido }}
          >
            <View style={styles.linha}>
              <Ionicons name={ehDoSistema(registo) ? 'sync-outline' : ICONES[registo.acao]} size={18} color={CORES[registo.acao]} />
              <Text style={styles.frase}>
                {fraseAlteracao(registo, nomes)}
                <Text style={styles.quando}> · {quandoCurto(registo.quando)}</Text>
              </Text>
              {detalhes.length > 0 && (
                <Ionicons name={expandido ? 'chevron-up' : 'chevron-down'} size={16} color={cores.textoMudo} />
              )}
            </View>
            {expandido &&
              detalhes.map((linha) => (
                <Text key={linha} style={styles.detalhe}>
                  {linha}
                </Text>
              ))}
          </Pressable>
        );
      })}

      {itens?.length === 0 && (
        <Text style={styles.vazio}>{filtro.entidades.length === 0 ? t('Ainda não há alterações.') : t('Ainda não há alterações deste tipo.')}</Text>
      )}

      {itens && itens.length < total && (
        <Botao
          variante="secundario"
          titulo={aCarregar ? t('A carregar…') : t('Ver mais')}
          aCarregar={aCarregar}
          onPress={() => carregar(pagina + 1)}
          style={styles.mais}
        />
      )}
    </Ecra>
  );
}

const styles = StyleSheet.create({
  voltar: {
    alignSelf: 'flex-start',
    marginTop: espaco.md,
  },
  ajuda: {
    ...tipografia.nota,
    color: cores.textoSecundario,
    marginBottom: espaco.md,
  },
  filtros: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
    marginBottom: espaco.md,
  },
  estado: {
    padding: espaco.xl,
    alignItems: 'center',
  },
  item: {
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.md,
    padding: espaco.md,
    marginBottom: espaco.sm,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
  },
  frase: {
    ...tipografia.corpoMedio,
    flex: 1,
  },
  quando: {
    ...tipografia.nota,
    color: cores.textoSecundario,
  },
  detalhe: {
    ...tipografia.nota,
    color: cores.textoSecundario,
    marginTop: 4,
    marginLeft: 26,
  },
  vazio: {
    ...tipografia.secundario,
    textAlign: 'center',
    fontStyle: 'italic',
    padding: espaco.xl,
  },
  mais: {
    marginBottom: espaco.xl,
  },
});
