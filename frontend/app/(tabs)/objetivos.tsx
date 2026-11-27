import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BarraProgresso } from '../../components/BarraProgresso';
import { Header } from '../../components/Header';
import { SeletorMes } from '../../components/SeletorMes';
import { SideMenu } from '../../components/SideMenu';
import { Separadores } from '../../components/Separadores';
import { Botao, CampoTexto, Cartao, CartaoSaldo, Chip, Ecra, Etiqueta, TituloSecao, ValorEuro } from '../../components/ui';
import { comAlfa, cores, espaco, fontes, gradientes, raio, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';
import {
  calcularSaldoDisponivel,
  CamposObjetivo,
  Mes,
  mesAtual,
  ObjetivoPoupanca,
  ObjetivosDB,
  Poupanca,
  PoupancasDB,
} from '../../services/database';
import { somarMeses } from '../../services/calculos';
import { confirmar } from '../../utils/confirmar';
import { mostrarAlerta, parseValor } from '../../utils/helpers';
import { corEstadoObjetivo, ritmoObjetivo, textoEstadoObjetivo, textoObjetivo } from '../../utils/orcamentos';

// O acento dos objetivos: o verde do dinheiro que se junta
const COR = cores.positivo;

// Até quando se pode marcar um objetivo (20 anos)
const MESES_NO_FUTURO = 240;

interface Dados {
  objetivos: ObjetivoPoupanca[];
  poupancas: Poupanca[];
}

// Objetivos de poupança: quanto juntar até quando, ligado ao saldo de uma poupança ou com o valor
// escrito à mão. A API calcula o que falta, quanto pôr de lado por mês e se está no bom caminho
export default function ObjetivosScreen() {
  const t = useT();
  const [menuVisible, setMenuVisible] = useState(false);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroCarregar, setErroCarregar] = useState(false);
  const ultimoPedido = useRef(0);
  const [saldo, setSaldo] = useState<number | undefined>(undefined);
  // Formulário: null = objetivo novo; senão o que está a ser editado
  const [aEditar, setAEditar] = useState<ObjetivoPoupanca | null>(null);
  const [nome, setNome] = useState('');
  const [valorAlvo, setValorAlvo] = useState('');
  const [mesAlvo, setMesAlvo] = useState<Mes>(() => somarMeses(mesAtual(), 6));
  const [poupancaId, setPoupancaId] = useState<string | undefined>(undefined);
  const [valorAtual, setValorAtual] = useState('');
  const [aGuardar, setAGuardar] = useState(false);
  const { user } = useAuth();

  useFocusEffect(
    useCallback(() => {
      carregar();
    }, [user])
  );

  async function carregar() {
    if (!user?.id) return;
    const pedido = ++ultimoPedido.current;
    try {
      const [objetivos, poupancas, disponivel] = await Promise.all([
        ObjetivosDB.getAll(user.id),
        PoupancasDB.getAll(user.id),
        calcularSaldoDisponivel(user.id),
      ]);
      if (pedido !== ultimoPedido.current) return;
      setDados({ objetivos, poupancas });
      setSaldo(disponivel);
      setErroCarregar(false);
    } catch (error) {
      if (pedido !== ultimoPedido.current) return;
      console.error('Erro ao carregar os objetivos:', error);
      setErroCarregar(true);
    }
  }

  function limpar() {
    setAEditar(null);
    setNome('');
    setValorAlvo('');
    setMesAlvo(somarMeses(mesAtual(), 6));
    setPoupancaId(undefined);
    setValorAtual('');
  }

  function editar(objetivo: ObjetivoPoupanca) {
    setAEditar(objetivo);
    setNome(objetivo.nome);
    setValorAlvo(String(objetivo.valorAlvo).replace('.', ','));
    // Um objetivo cujo mês já passou: para o mudar, só para este mês ou depois
    setMesAlvo(objetivo.mesAlvo < mesAtual() ? mesAtual() : objetivo.mesAlvo);
    setPoupancaId(objetivo.poupancaId);
    setValorAtual(objetivo.poupancaId ? '' : String(objetivo.valorAtual).replace('.', ','));
  }

  async function guardar() {
    if (!user?.id || aGuardar) return;
    const alvo = parseValor(valorAlvo);
    if (!nome.trim() || !(alvo > 0)) {
      mostrarAlerta(t('Erro'), t('Preenche o nome e o valor que queres juntar'));
      return;
    }
    const atual = valorAtual.trim() ? parseValor(valorAtual) : undefined;
    if (atual !== undefined && !(atual >= 0)) {
      mostrarAlerta(t('Erro'), t('O valor que já tens não pode ser negativo'));
      return;
    }
    // Ligado a uma poupança, o progresso é o saldo dela: o valor à mão não se envia
    const campos: CamposObjetivo = {
      nome: nome.trim(),
      valorAlvo: alvo,
      mesAlvo,
      poupancaId,
      valorAtual: poupancaId ? undefined : atual ?? (aEditar ? undefined : 0),
    };
    setAGuardar(true);
    try {
      if (aEditar) {
        const mudou = (campo: keyof CamposObjetivo, original: unknown) => (campos[campo] !== original ? campos[campo] : undefined);
        await ObjetivosDB.update(user.id, aEditar.id, {
          nome: mudou('nome', aEditar.nome) as string | undefined,
          valorAlvo: mudou('valorAlvo', aEditar.valorAlvo) as number | undefined,
          mesAlvo: mudou('mesAlvo', aEditar.mesAlvo) as Mes | undefined,
          // undefined desliga a poupança (vai em "limpar"); só se envia se mudou
          ...(poupancaId !== aEditar.poupancaId ? { poupancaId } : {}),
          valorAtual: campos.valorAtual,
        });
      } else {
        await ObjetivosDB.add(user.id, campos);
      }
      limpar();
      await carregar();
    } catch (error) {
      console.error('Erro ao guardar o objetivo:', error);
      mostrarAlerta(t('Erro'), error instanceof Error ? error.message : t('Não foi possível guardar o objetivo.'));
    } finally {
      setAGuardar(false);
    }
  }

  async function remover(objetivo: ObjetivoPoupanca) {
    if (!user?.id) return;
    if (!(await confirmar(t('Remover objetivo'), t('Remover "{nome}"? A poupança ligada (se houver) não muda.', { nome: objetivo.nome }), t('Remover')))) return;
    try {
      await ObjetivosDB.remove(user.id, objetivo.id);
      limpar();
      await carregar();
    } catch (error) {
      console.error('Erro ao remover o objetivo:', error);
      mostrarAlerta(t('Erro'), t('Não foi possível remover o objetivo.'));
    }
  }

  const juntado = dados?.objetivos.reduce((s, o) => s + o.valorAtual, 0);
  const totalAlvo = dados?.objetivos.reduce((s, o) => s + o.valorAlvo, 0) ?? 0;
  const atingidos = dados?.objetivos.filter((o) => o.estado === 'atingido').length ?? 0;

  return (
    <Ecra
      keyboardShouldPersistTaps="handled"
      cabecalho={
        <>
          <Header title={t('Objetivos')} onMenuPress={() => setMenuVisible(true)} saldo={saldo} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} saldo={saldo} />
        </>
      }
    >
      <Separadores grupo="planeamento" />
      {!dados ? (
        erroCarregar ? (
          <View style={styles.estado}>
            <Text style={styles.vazio}>{t('Não foi possível carregar os objetivos.')}</Text>
            <Botao variante="secundario" pequeno icone="refresh-outline" titulo={t('Tentar outra vez')} onPress={carregar} />
          </View>
        ) : (
          <ActivityIndicator style={styles.estado} color={COR} />
        )
      ) : (
        <>
          <CartaoSaldo
            variante="positivo"
            alertaNegativo={false}
            rotulo={t('Já juntaste')}
            valor={juntado}
            icone="flag-outline"
            subtitulo={
              dados.objetivos.length > 0
                ? t('de {total} € · {atingidos} de {totalObjetivos} objetivos atingidos', {
                    total: totalAlvo.toFixed(2),
                    atingidos,
                    totalObjetivos: dados.objetivos.length,
                  })
                : t('Ainda sem objetivos')
            }
            style={styles.resumo}
          />

          {dados.objetivos.length === 0 && (
            <Text style={styles.vazio}>
              {t('Cria um objetivo em baixo (ex.: 1500 € para férias até junho) e a app diz-te quanto pôr de lado por mês.')}
            </Text>
          )}

          {dados.objetivos.map((o) => {
            const cor = corEstadoObjetivo(o.estado);
            const ritmo = ritmoObjetivo(o);
            return (
              <Cartao
                key={o.id}
                acento={cor}
                ativo={aEditar?.id === o.id}
                onPress={() => editar(o)}
                accessibilityLabel={t('{nome}: {atual} de {alvo} euros, {estado}', {
                  nome: o.nome,
                  atual: o.valorAtual.toFixed(2),
                  alvo: o.valorAlvo.toFixed(2),
                  estado: textoEstadoObjetivo(o.estado),
                })}
                accessibilityHint={t('Abre para editar ou remover')}
                style={styles.item}
              >
                <View style={styles.itemTopo}>
                  <View style={[styles.icone, { backgroundColor: comAlfa(cor, 0.12), borderColor: comAlfa(cor, 0.3) }]}>
                    <Ionicons name={o.estado === 'atingido' ? 'trophy-outline' : 'flag-outline'} size={16} color={cor} />
                  </View>
                  <Text style={styles.itemTitulo} numberOfLines={2}>
                    {o.nome}
                  </Text>
                  <Etiqueta texto={textoEstadoObjetivo(o.estado)} cor={cor} style={styles.etiqueta} />
                </View>
                <View style={styles.valores}>
                  <ValorEuro valor={o.valorAtual} cor={COR} style={styles.valorAtual} />
                  <Text style={styles.valorAlvo}>{t(' de {valor} €', { valor: o.valorAlvo.toFixed(2) })}</Text>
                  <Text style={styles.percentagem}>{Math.round(o.percentagem)}%</Text>
                </View>
                <BarraProgresso
                  percentagem={o.percentagem}
                  cor={cor}
                  degrade={o.estado === 'atrasado' ? undefined : gradientes.progresso}
                  altura={10}
                  style={styles.barra}
                  accessibilityLabel={t('{percentagem}% de {nome}', { percentagem: Math.round(o.percentagem), nome: o.nome })}
                />
                <Text style={styles.texto}>{textoObjetivo(o)}</Text>
                {ritmo && <Text style={[styles.ritmo, { color: ritmo.cor }]}>{ritmo.texto}</Text>}
                <Text style={styles.nota}>
                  {o.poupancaId
                    ? t('Segue o saldo de: {nome}', { nome: o.poupancaNome ?? t('poupança') })
                    : t('Valor escrito à mão')}
                </Text>
              </Cartao>
            );
          })}
        </>
      )}

      <Cartao style={styles.formulario}>
        <TituloSecao
          titulo={aEditar ? t('Editar objetivo') : t('Novo objetivo')}
          icone={aEditar ? 'create-outline' : 'add-circle-outline'}
          cor={COR}
        />
        <CampoTexto rotulo={t('Nome')} placeholder={t('ex: Férias, Carro novo')} value={nome} onChangeText={setNome} />
        <CampoTexto
          rotulo={t('Quanto queres juntar (€)')}
          placeholder={t('ex: 1500')}
          keyboardType="numeric"
          value={valorAlvo}
          onChangeText={setValorAlvo}
          accessibilityLabel={t('Quanto queres juntar em euros')}
        />

        <Text style={styles.label}>{t('Até quando')}</Text>
        <SeletorMes
          mes={mesAlvo}
          onChange={setMesAlvo}
          minimo={mesAtual()}
          maximo={somarMeses(mesAtual(), MESES_NO_FUTURO)}
          atalho={false}
        />

        <Text style={styles.label}>{t('Onde estás a juntar')}</Text>
        <View style={styles.opcoes}>
          <Chip rotulo={t('Nenhuma (escrevo o valor)')} onPress={() => setPoupancaId(undefined)} ativo={!poupancaId} cor={COR} />
          {(dados?.poupancas ?? []).map((p) => (
            <Chip
              key={p.id}
              rotulo={t('{nome} · {saldo} €', { nome: p.nome, saldo: p.saldo.toFixed(2) })}
              icone="trending-up-outline"
              onPress={() => setPoupancaId(p.id)}
              ativo={poupancaId === p.id}
              cor={COR}
            />
          ))}
        </View>
        {poupancaId ? (
          <Text style={styles.nota}>{t('O progresso é o saldo desta poupança (sobe com as contribuições do dia do salário).')}</Text>
        ) : (
          <CampoTexto
            rotulo={t('Quanto já tens (€)')}
            placeholder={t('ex: 200')}
            keyboardType="numeric"
            value={valorAtual}
            onChangeText={setValorAtual}
            accessibilityLabel={t('Quanto já tens em euros')}
          />
        )}

        <Botao
          titulo={aGuardar ? t('A guardar…') : aEditar ? t('Guardar') : t('Adicionar')}
          icone={aEditar ? 'checkmark' : 'add'}
          onPress={guardar}
          aCarregar={aGuardar}
          style={styles.botao}
        />
        {aEditar && (
          <View style={styles.linhaBotoes}>
            <Botao variante="perigo" icone="trash-outline" titulo={t('Remover')} onPress={() => remover(aEditar)} style={styles.botaoLinha} />
            <Botao variante="secundario" cor={cores.textoSecundario} titulo={t('Cancelar')} onPress={limpar} style={styles.botaoLinha} />
          </View>
        )}
      </Cartao>
    </Ecra>
  );
}

const styles = StyleSheet.create({
  estado: {
    padding: espaco.xl,
    alignItems: 'center',
    gap: espaco.md,
  },
  resumo: {
    marginBottom: espaco.xl,
  },
  vazio: {
    ...tipografia.secundario,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: espaco.lg,
  },
  item: {
    marginBottom: espaco.sm,
  },
  itemTopo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
  },
  icone: {
    width: 30,
    height: 30,
    borderRadius: raio.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitulo: {
    ...tipografia.tituloCartao,
    flex: 1,
  },
  etiqueta: {
    paddingVertical: 2,
  },
  valores: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: espaco.md,
  },
  valorAtual: {
    fontFamily: fontes.numeroForte,
    fontSize: 20,
  },
  valorAlvo: {
    ...tipografia.secundario,
    flex: 1,
  },
  percentagem: {
    fontFamily: fontes.numeroForte,
    fontSize: 15,
    color: cores.texto,
  },
  barra: {
    marginVertical: espaco.sm + 2,
  },
  texto: {
    ...tipografia.corpo,
    fontSize: 14,
  },
  ritmo: {
    ...tipografia.nota,
    marginTop: espaco.xs,
  },
  nota: {
    ...tipografia.nota,
    marginTop: 2,
    marginBottom: espaco.sm,
  },
  formulario: {
    marginTop: espaco.md,
  },
  label: {
    ...tipografia.rotulo,
    fontSize: 11,
    marginBottom: 6,
  },
  opcoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: espaco.md,
  },
  botao: {
    marginTop: espaco.sm,
  },
  linhaBotoes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm + 2,
    marginTop: espaco.sm + 2,
  },
  botaoLinha: {
    flexGrow: 1,
  },
});
