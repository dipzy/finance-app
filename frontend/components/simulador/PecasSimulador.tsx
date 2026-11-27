import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COR_CARTAO, COR_CONTA } from '../../constants/meiosPagamento';
import { comAlfa, cores, espaco, raio, tipografia } from '../../constants/tema';
import { useT } from '../../i18n';
import { centimos } from '../../services/calculos';
import type { Categoria, Poupanca, ValorCategoria } from '../../services/tipos';
import { CATEGORIAS, infoCategoria, nomeCategoria } from '../../utils/categorias';
import { parseValor } from '../../utils/helpers';
import { euros } from '../../utils/orcamentos';
import { Botao, Cartao, CampoTexto, Chip, Etiqueta, TituloSecao } from '../ui';

// Peças partilhadas pelas duas partes do simulador (a conta e o cartão de alimentação)

// O acento do simulador: o azul do planeamento
export const COR_SIMULADOR = cores.primaria;

// De onde vêm os gastos: o mês atual (até hoje) ou a média por mês dos meses completos anteriores
export type Periodo = 'atual' | 'media';

// Um número escrito à mão ("12,5") ou vazio
export const numero = (texto: string | undefined) => (texto?.trim() ? parseValor(texto) : 0);
// Um valor opcional: vazio fica undefined (= o de agora)
export const numeroOuNada = (texto: string | undefined) => (texto?.trim() ? parseValor(texto) : undefined);
// De volta para o campo, com vírgula
export const paraCampo = (valor: number) => String(Math.round(valor * 100) / 100).replace('.', ',');

export type Origem = 'conta' | 'cartao';

const ORIGEM: Record<Origem, { texto: string; cor: string }> = {
  conta: { texto: 'Conta', cor: COR_CONTA },
  cartao: { texto: 'Cartão de alimentação', cor: COR_CARTAO },
};

// Uma linha: o que se gastou numa categoria com a conta ou com o cartão
interface LinhaGasto {
  categoria: Categoria;
  origem: Origem;
  valor: number;
  fixas: number; // a parte que é de despesas mensais
}

interface LinhasGastosProps {
  linhas: LinhaGasto[];
  escritos: Record<Origem, Partial<Record<Categoria, string>>>; // o que está escrito em cada campo
  novos: Record<Origem, Partial<Record<Categoria, number>>>; // o valor novo de cada linha que mudou
  onChange: (origem: Origem, categoria: Categoria, texto: string) => void;
  rotuloBase: (valor: string) => string; // "média 120 €" ou "este mês 120 €" (já traduzido)
  // De onde saem os gastos: só se mostra a quem tem cartão de alimentação (senão tudo sai da conta e é óbvio)
  comOrigem: boolean;
}

// Uma linha por categoria: o que se gastou, um campo "Novo valor (€)" e os atalhos "Metade" e "Zero".
// Mais baixo poupa, mais alto gasta mais; passar dinheiro de uma para outra dá zero.
export function LinhasGastos({ linhas, escritos, novos, onChange, rotuloBase, comOrigem }: LinhasGastosProps) {
  const t = useT();
  return (
    <>
      {linhas.map((c) => {
        const info = infoCategoria(c.categoria);
        const origem = comOrigem ? c.origem : undefined;
        const escrito = escritos[c.origem][c.categoria] ?? '';
        const novo = novos[c.origem][c.categoria];
        const poupa = novo !== undefined ? centimos(c.valor - novo) : 0;
        const nome = nomeCategoria(c.categoria);
        return (
          <View key={`${c.origem}:${c.categoria}`} style={estilos.linha}>
            <View style={estilos.linhaTopo}>
              <View style={[estilos.icone, { backgroundColor: comAlfa(info.cor, 0.12), borderColor: comAlfa(info.cor, 0.3) }]}>
                <Ionicons name={info.icone} size={16} color={info.cor} />
              </View>
              <Text style={estilos.linhaNome} numberOfLines={1}>
                {nome}
              </Text>
              <Text style={estilos.linhaPrevisto}>{rotuloBase(euros(c.valor))}</Text>
            </View>
            {origem && (
              <View style={estilos.linhaOrigem}>
                <Etiqueta texto={ORIGEM[origem].texto} cor={ORIGEM[origem].cor} />
              </View>
            )}
            {c.fixas > 0 && <Text style={estilos.detalhe}>{t('Inclui {valor} de despesas mensais', { valor: euros(c.fixas) })}</Text>}
            <View style={estilos.linhaCampos}>
              <CampoTexto
                placeholder={t('Novo valor (€)')}
                keyboardType="numeric"
                value={escrito}
                onChangeText={(texto) => onChange(c.origem, c.categoria, texto)}
                estiloCaixa={estilos.campo}
                accessibilityLabel={
                  origem
                    ? t('Novo valor de {nome} ({origem}), em euros', { nome, origem: t(ORIGEM[origem].texto) })
                    : t('Novo valor de {nome}, em euros', { nome })
                }
              />
              <Chip rotulo={t('Metade')} onPress={() => onChange(c.origem, c.categoria, paraCampo(c.valor / 2))} cor={COR_SIMULADOR} />
              <Chip rotulo={t('Zero')} onPress={() => onChange(c.origem, c.categoria, '0')} cor={COR_SIMULADOR} />
            </View>
            {poupa > 0 && <Text style={estilos.poupa}>{t('Poupas {valor}', { valor: euros(poupa) })}</Text>}
            {poupa < 0 && <Text style={estilos.aviso}>{t('Gastas mais {valor}', { valor: euros(-poupa) })}</Text>}
          </View>
        );
      })}
    </>
  );
}

// Uma linha por categoria e origem, a categoria que mais se gasta primeiro (conta e cartão juntos); só as que têm
// gastos, ou todas (a zero) para se poder passar dinheiro para uma categoria nova
function juntarLinhas(conta: ValorCategoria[], cartao: ValorCategoria[] | null, todas: boolean): LinhaGasto[] {
  const deConta = new Map(conta.map((c) => [c.categoria, c]));
  const deCartao = new Map((cartao ?? []).map((c) => [c.categoria, c]));
  const categorias = new Set<Categoria>([...deConta.keys(), ...deCartao.keys()]);
  if (todas) CATEGORIAS.forEach((c) => categorias.add(c.chave));
  const total = (categoria: Categoria) => (deConta.get(categoria)?.valor ?? 0) + (deCartao.get(categoria)?.valor ?? 0);
  const ordem = [...categorias].sort((a, b) => total(b) - total(a));
  const linhas: LinhaGasto[] = [];
  for (const categoria of ordem) {
    const c = deConta.get(categoria);
    if (c || todas) linhas.push({ categoria, origem: 'conta', valor: c?.valor ?? 0, fixas: c?.fixas ?? 0 });
    const k = deCartao.get(categoria);
    if (cartao && (k || todas)) linhas.push({ categoria, origem: 'cartao', valor: k?.valor ?? 0, fixas: 0 });
  }
  return linhas;
}

interface BlocoGastosProps extends Omit<LinhasGastosProps, 'linhas' | 'comOrigem'> {
  conta: ValorCategoria[]; // o que se gastou em cada categoria com a conta
  cartao: ValorCategoria[] | null; // e com o cartão de alimentação (null: sem cartão)
  vazio: string; // o que dizer quando ainda não há gastos
}

// O cartão "E se mudasse os gastos?": as linhas por categoria (conta e cartão juntos, cada uma com a sua origem) e o
// botão para ver também as categorias sem gastos
export function BlocoGastos({ conta, cartao, vazio, ...resto }: BlocoGastosProps) {
  const t = useT();
  const [todas, setTodas] = useState(false);
  const lista = juntarLinhas(conta, cartao, todas);
  return (
    <Cartao style={estilos.bloco}>
      <TituloSecao titulo={t('E se mudasse os gastos?')} icone="cut-outline" cor={COR_SIMULADOR} />
      <Text style={estilos.nota}>{t('Escreve o valor novo de cada categoria. Mais baixo poupa; tirar de uma e pôr noutra dá zero.')}</Text>
      {lista.length === 0 ? <Text style={estilos.vazio}>{vazio}</Text> : <LinhasGastos linhas={lista} comOrigem={cartao !== null} {...resto} />}
      <Botao
        variante="secundario"
        pequeno
        icone={todas ? 'chevron-up-outline' : 'chevron-down-outline'}
        titulo={todas ? t('Só as que têm gastos') : t('Mostrar todas as categorias')}
        onPress={() => setTodas((atual) => !atual)}
      />
    </Cartao>
  );
}

interface CamposPoupancasProps {
  poupancas: Poupanca[];
  valores: Record<string, string>; // a contribuição mensal nova escrita em cada poupança (por id)
  onChange: (id: string, texto: string) => void;
}

// Uma linha por poupança: a contribuição de hoje, um campo para a nova e o atalho "Parar"
export function CamposPoupancas({ poupancas, valores, onChange }: CamposPoupancasProps) {
  const t = useT();
  return (
    <>
      {poupancas.map((p) => (
        <View key={p.id} style={estilos.linha}>
          <View style={estilos.linhaTopo}>
            <Text style={estilos.linhaNome} numberOfLines={1}>
              {p.nome}
            </Text>
            <Text style={estilos.linhaPrevisto}>{t('hoje {valor}/mês', { valor: euros(p.valorMensal ?? 0) })}</Text>
          </View>
          <View style={estilos.linhaCampos}>
            <CampoTexto
              placeholder={t('Nova contribuição (€/mês)')}
              keyboardType="numeric"
              value={valores[p.id] ?? ''}
              onChangeText={(texto) => onChange(p.id, texto)}
              estiloCaixa={estilos.campo}
              accessibilityLabel={t('Nova contribuição mensal em {nome}, em euros', { nome: p.nome })}
            />
            <Chip rotulo={t('Parar')} onPress={() => onChange(p.id, '0')} cor={COR_SIMULADOR} />
          </View>
        </View>
      ))}
    </>
  );
}

interface LinhaResultadoProps {
  rotulo: string;
  valor: string;
  bom?: boolean; // verde se é bom, laranja se não; sem isto, cor normal
  forte?: boolean; // a linha do total
}

// Uma linha do resultado: o rótulo à esquerda e o valor à direita
export function LinhaResultado({ rotulo, valor, bom, forte }: LinhaResultadoProps) {
  const cor = bom === undefined ? cores.texto : bom ? cores.positivo : cores.aviso;
  return (
    <View style={[estilos.linhaResultado, forte && estilos.linhaForte]}>
      <Text style={[estilos.resultadoRotulo, forte && estilos.resultadoForte]}>{rotulo}</Text>
      <Text style={[estilos.resultadoValor, { color: cor }, forte && estilos.resultadoForte]}>{valor}</Text>
    </View>
  );
}

export const estilos = StyleSheet.create({
  bloco: {
    marginBottom: espaco.md,
  },
  vazio: {
    ...tipografia.secundario,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: espaco.lg,
  },
  linha: {
    paddingVertical: espaco.sm,
  },
  linhaTopo: {
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
  linhaNome: {
    ...tipografia.tituloCartao,
    flex: 1,
  },
  linhaPrevisto: {
    ...tipografia.secundario,
    fontSize: 13,
  },
  linhaOrigem: {
    flexDirection: 'row',
    marginTop: espaco.xs,
    marginLeft: 38, // por baixo do nome (30 do ícone + o espaço)
  },
  linhaCampos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    marginTop: espaco.sm,
  },
  campo: {
    flex: 1,
  },
  aviso: {
    ...tipografia.nota,
    color: cores.aviso,
    marginTop: 2,
  },
  detalhe: {
    ...tipografia.nota,
    marginTop: 2,
    marginLeft: 38, // por baixo do nome, como a etiqueta
  },
  subtitulo: {
    ...tipografia.tituloCartao,
    marginTop: espaco.sm,
    marginBottom: espaco.xs,
  },
  poupa: {
    ...tipografia.nota,
    color: cores.positivo,
    marginTop: 2,
  },
  nota: {
    ...tipografia.nota,
    marginBottom: espaco.md,
  },
  rotulo: {
    ...tipografia.rotulo,
    fontSize: 11,
    marginBottom: 6,
  },
  resultado: {
    marginTop: espaco.md,
    gap: espaco.xs,
  },
  linhaResultado: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: espaco.md,
  },
  linhaForte: {
    marginTop: espaco.xs,
    paddingTop: espaco.sm,
    borderTopWidth: 1,
    borderTopColor: cores.borda,
  },
  resultadoRotulo: {
    ...tipografia.secundario,
    flexShrink: 1,
  },
  resultadoValor: {
    ...tipografia.corpo,
    fontSize: 14,
    textAlign: 'right',
  },
  resultadoForte: {
    fontWeight: '700',
  },
});
