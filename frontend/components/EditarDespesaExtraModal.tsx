import { useState } from 'react';
import { Text, View } from 'react-native';
import { useT } from '../i18n';
import { acentosFolha, cores } from '../constants/tema';
import type { Categoria, Despesa, MeioPagamento, SugestaoCategoria } from '../services/tipos';
import { confirmar } from '../utils/confirmar';
import { eCombustivel } from '../utils/combustivel';
import { CamposExtra, textoDataGuardada, textoValor, validarEdicaoExtra } from '../utils/ecrasDespesas';
import { mostrarAlerta } from '../utils/helpers';
import { CampoData } from './CampoData';
import { estilosFormulario as f, ModalFormulario } from './ModalFormulario';
import { SeletorCategoria } from './SeletorCategoria';
import { SeletorMeioPagamento } from './SeletorMeioPagamento';
import { Botao, CampoTexto, formatarEuro } from './ui';
import { useSugestaoCategoria } from './useSugestaoCategoria';

// O acento das gastos do dia a dia (o roxo do bloco "Despesas do Mês")
const COR = acentosFolha.despesasMes;

interface EditarDespesaExtraModalProps {
  despesa: Despesa | null; // null = fechado
  onFechar: () => void;
  // O ecrã grava, recarrega e fecha o modal (ou mostra o erro e deixa-o aberto)
  onGuardar: (despesa: Despesa, campos: CamposExtra) => Promise<void>;
  onApagar: (despesa: Despesa) => Promise<void>;
  // A categoria sugerida para um título (sem isto, a categoria só muda à mão)
  sugerirCategoria?: (titulo: string) => Promise<Categoria | SugestaoCategoria>;
  // Os saldos a mostrar em "Pagar com" (conta e cartão de alimentação)
  saldoConta?: number;
  saldoCartao?: number;
}

export function EditarDespesaExtraModal({
  despesa,
  onFechar,
  onGuardar,
  onApagar,
  sugerirCategoria,
  saldoConta,
  saldoCartao,
}: EditarDespesaExtraModalProps) {
  const t = useT();
  const [titulo, setTitulo] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState('');
  const [litros, setLitros] = useState('');
  // Escolhida à mão neste formulário (null = a da despesa, ou a sugerida pelo título)
  const [categoriaEscolhida, setCategoriaEscolhida] = useState<Categoria | null>(null);
  const [meioPagamento, setMeioPagamento] = useState<MeioPagamento>('conta');
  const [ocupado, setOcupado] = useState(false);
  // A despesa aberta fica guardada para o conteúdo não desaparecer durante a animação de fechar
  const [aberta, setAberta] = useState<Despesa | null>(null);
  const [anterior, setAnterior] = useState<Despesa | null>(null);

  // Ao abrir uma despesa, os campos começam com os valores dela (acerto durante o render,
  // como recomendado pelo React, para não aparecerem um instante os valores da anterior)
  if (despesa !== anterior) {
    setAnterior(despesa);
    if (despesa) {
      setAberta(despesa);
      setTitulo(despesa.titulo);
      setValor(textoValor(despesa.valor));
      setData(textoDataGuardada(despesa.data));
      setLitros(despesa.litros ? textoValor(despesa.litros) : '');
      setCategoriaEscolhida(null);
      setMeioPagamento(despesa.meioPagamento ?? 'conta');
      setOcupado(false);
    }
  }

  // A sugestão pelo título conta nas despesas antigas (sem categoria) e quando se muda o título;
  // tocar num chip fixa a categoria
  const tituloMudou = !!aberta && titulo.trim() !== aberta.titulo;
  const sugerirAgora = despesa !== null && categoriaEscolhida === null && (!aberta?.categoria || tituloMudou);
  const sugestao = useSugestaoCategoria(titulo, sugerirCategoria, sugerirAgora);
  const categoria: Categoria = categoriaEscolhida ?? (sugerirAgora ? sugestao?.categoria : undefined) ?? aberta?.categoria ?? 'outros';

  function fechar() {
    if (!ocupado) onFechar();
  }

  async function guardar() {
    if (!aberta || ocupado) return;
    const resultado = validarEdicaoExtra(aberta, { titulo, valor, data, categoria, meioPagamento, litros: eCombustivel(categoria) ? litros : undefined });
    if ('erro' in resultado) {
      mostrarAlerta(t('Erro'), resultado.erro);
      return;
    }
    if (Object.keys(resultado.campos).length === 0) {
      onFechar();
      return;
    }
    setOcupado(true);
    try {
      await onGuardar(aberta, resultado.campos);
    } finally {
      setOcupado(false);
    }
  }

  async function apagar() {
    if (!aberta || ocupado) return;
    // As despesas registadas em versões anteriores nunca saíram da conta: apagá-las não devolve nada
    const mensagem = aberta.descontadaDaConta
      ? t('"{titulo}" vai ser apagada e os {valor} € voltam para a conta.', { titulo: aberta.titulo, valor: aberta.valor.toFixed(2) })
      : t('"{titulo}" vai ser apagada. Foi registada numa versão anterior da app e não saiu da conta, por isso o saldo não muda.', { titulo: aberta.titulo });
    if (!(await confirmar(t('Apagar despesa'), mensagem, 'Apagar'))) return;
    setOcupado(true);
    try {
      await onApagar(aberta);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <ModalFormulario visivel={despesa !== null} titulo={t('Editar gasto')} onFechar={fechar}>
      <CampoTexto
        rotulo={t('Título')}
        placeholder={t('Título (ex: Jantar fora, Cinema, Compras)')}
        value={titulo}
        onChangeText={setTitulo}
        accessibilityLabel={t('Título')}
      />

      <CampoTexto
        rotulo={t('Valor (€)')}
        placeholder={t('Valor (€)')}
        keyboardType="numeric"
        value={valor}
        onChangeText={setValor}
        accessibilityLabel={t('Valor em euros')}
      />

      <SeletorCategoria
        valor={categoria}
        onChange={setCategoriaEscolhida}
        sugerida={categoriaEscolhida === null && sugerirAgora && !!sugestao}
        origemTexto={categoriaEscolhida === null && sugerirAgora ? sugestao?.origemTexto : undefined}
      />

      {eCombustivel(categoria) && (
        <CampoTexto
          rotulo={t('Litros (opcional)')}
          placeholder={t('ex: 35,2')}
          keyboardType="numeric"
          value={litros}
          onChangeText={setLitros}
          accessibilityLabel={t('Litros abastecidos')}
        />
      )}

      <SeletorMeioPagamento valor={meioPagamento} onChange={setMeioPagamento} saldoConta={saldoConta} saldoCartao={saldoCartao} />

      <Text style={f.label}>{t('Data')}</Text>
      <CampoData valor={data} onChange={setData} cor={COR} />

      {aberta?.saldoAntes !== undefined && aberta.saldoAntes !== null && (
        <Text style={f.nota}>
          {aberta.meioPagamento === 'cartaoAlimentacao' ? t('Cartão de alimentação') : t('Conta')}: {t('Saldo antes: {valor}', { valor: formatarEuro(aberta.saldoAntes) })}
        </Text>
      )}

      {aberta?.descontadaDaConta && (
        <Text style={f.nota}>{t('Se mudares o valor ou o meio de pagamento, a conta e o cartão são acertados.')}</Text>
      )}

      <Botao titulo={t('Guardar')} icone="checkmark" onPress={guardar} desativado={ocupado} style={f.botaoPrincipal} />

      <View style={f.linhaBotoes}>
        <Botao
          variante="perigo"
          titulo={t('Apagar')}
          icone="trash-outline"
          onPress={apagar}
          desativado={ocupado}
          style={f.botaoLinha}
        />
        <Botao
          variante="secundario"
          cor={cores.textoSecundario}
          titulo={t('Cancelar')}
          onPress={fechar}
          desativado={ocupado}
          style={f.botaoLinha}
        />
      </View>
    </ModalFormulario>
  );
}
