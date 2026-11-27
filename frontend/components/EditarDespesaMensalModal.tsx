import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useT } from '../i18n';
import { cores } from '../constants/tema';
import { nomeMes } from '../services/calculos';
import type { Categoria, Despesa, PagamentoFixa } from '../services/tipos';
import { confirmar } from '../utils/confirmar';
import { CamposMensal, mensagemApagarMensal, textoValor, validarEdicaoMensal } from '../utils/ecrasDespesas';
import { parseValor } from '../utils/formatos';
import { textoPrecoPorUnidade, textoUltimaFatura, type UltimaFatura, ultimaFaturaComConsumo } from '../utils/faturas';
import { mostrarAlerta } from '../utils/helpers';
import { mesmaDivisao } from '../utils/partilhado';
import { estilosFormulario as f, ModalFormulario } from './ModalFormulario';
import { CampoDebitoAutomatico } from './CampoDebitoAutomatico';
import { CampoValorVariavel } from './CampoValorVariavel';
import { DivisaoGrupo, type EstadoDivisao } from './partilhado/DivisaoGrupo';
import { SeletorCategoria } from './SeletorCategoria';
import { Botao, CampoTexto } from './ui';

interface EditarDespesaMensalModalProps {
  despesa: Despesa | null; // null = fechado
  pagaEsteMes: boolean; // muda o que acontece ao apagar (ver DespesasFixasDB.terminar)
  // Quanto falta pagar este mês (0 = já está paga): limita o pagamento parcial
  emFalta: number;
  onFechar: () => void;
  // O ecrã grava, recarrega e fecha o modal (ou mostra o erro e deixa-o aberto)
  onGuardar: (despesa: Despesa, campos: CamposMensal) => Promise<void>;
  onApagar: (despesa: Despesa) => Promise<void>;
  onDebitarParcial?: (despesa: Despesa, valor: number) => Promise<void>;
  // Paga com o valor da fatura (e o consumo, se a despesa tiver unidade de contador)
  onPagarFatura?: (despesa: Despesa, valor: number, consumo?: number) => Promise<void>;
  // Os pagamentos já feitos da despesa (para mostrar o consumo e o custo por unidade da fatura anterior)
  obterPagamentos?: (fixaId: string) => Promise<PagamentoFixa[]>;
  // Abre já no pagamento da fatura (ao carregar em "Pagar" numa despesa de valor variável)
  iniciarEmFatura?: boolean;
}

export function EditarDespesaMensalModal({
  despesa,
  pagaEsteMes,
  emFalta,
  onFechar,
  onGuardar,
  onApagar,
  onDebitarParcial,
  onPagarFatura,
  obterPagamentos,
  iniciarEmFatura,
}: EditarDespesaMensalModalProps) {
  const t = useT();
  const [titulo, setTitulo] = useState('');
  const [valor, setValor] = useState('');
  const [diaDebito, setDiaDebito] = useState('');
  const [categoria, setCategoria] = useState<Categoria | undefined>();
  const [valorParcial, setValorParcial] = useState('');
  const [modoParcial, setModoParcial] = useState(false);
  const [variavel, setVariavel] = useState(false);
  const [debitoAutomatico, setDebitoAutomatico] = useState(true);
  const [unidade, setUnidade] = useState('');
  const [modoFatura, setModoFatura] = useState(false);
  const [valorFatura, setValorFatura] = useState('');
  const [consumoFatura, setConsumoFatura] = useState('');
  const [ultimaFatura, setUltimaFatura] = useState<UltimaFatura | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [divisao, setDivisao] = useState<EstadoDivisao>({ divisao: null, erro: null, minhaParte: null });
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
      // Dividida: o que se edita é o total (o valor da despesa é só a parte de quem paga)
      setValor(textoValor(despesa.valorTotal ?? despesa.valor));
      setDivisao({ divisao: despesa.divisao ?? null, erro: null, minhaParte: null });
      setDiaDebito(despesa.diaDebito ? String(despesa.diaDebito) : '');
      setCategoria(despesa.categoria);
      setValorParcial('');
      setModoParcial(false);
      setVariavel(!!despesa.variavel);
      setDebitoAutomatico(despesa.debitoAutomatico !== false);
      setUnidade(despesa.unidadeConsumo ?? '');
      setModoFatura(!!iniciarEmFatura && !!despesa.variavel);
      setValorFatura(textoValor(despesa.valor));
      setConsumoFatura('');
      setUltimaFatura(null);
      setOcupado(false);
    }
  }

  // Ao pagar a fatura, mostra o que a anterior custou e consumiu (se se registou o consumo)
  useEffect(() => {
    if (!modoFatura || !aberta || !obterPagamentos || !aberta.unidadeConsumo) return;
    let atual = true;
    obterPagamentos(aberta.id)
      .then((lista) => atual && setUltimaFatura(ultimaFaturaComConsumo(lista)))
      .catch(() => {});
    return () => {
      atual = false;
    };
  }, [modoFatura, aberta?.id, aberta?.unidadeConsumo]);

  async function confirmarPagamentoFatura() {
    if (!aberta || ocupado || !onPagarFatura) return;

    const numero = parseValor(valorFatura);
    if (!Number.isFinite(numero) || numero <= 0) {
      mostrarAlerta(t('Erro'), t('Indica o valor da fatura.'));
      return;
    }
    let consumo: number | undefined;
    if (aberta.unidadeConsumo && consumoFatura.trim()) {
      consumo = parseValor(consumoFatura);
      if (!Number.isFinite(consumo) || consumo < 0) {
        mostrarAlerta(t('Erro'), t('Indica um consumo válido.'));
        return;
      }
    }

    setOcupado(true);
    try {
      await onPagarFatura(aberta, numero, consumo);
      setModoFatura(false);
      onFechar();
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarPagamentoParcial() {
    if (!aberta || ocupado || !onDebitarParcial) return;

    const numero = parseValor(valorParcial);
    if (!Number.isFinite(numero) || numero <= 0) {
      mostrarAlerta(t('Erro'), t('Indica um valor parcial válido.'));
      return;
    }

    if (Math.round(numero * 100) > Math.round(emFalta * 100)) {
      mostrarAlerta(t('Erro'), t('O valor parcial não pode ser maior do que falta pagar ({falta} €).', { falta: textoValor(emFalta) }));
      return;
    }

    setOcupado(true);
    try {
      await onDebitarParcial(aberta, numero);
      setModoParcial(false);
      setValorParcial('');
      onFechar();
    } finally {
      setOcupado(false);
    }
  }

  function fechar() {
    if (!ocupado) onFechar();
  }

  async function guardar() {
    if (!aberta || ocupado) return;
    const resultado = validarEdicaoMensal(aberta, { titulo, valor, diaDebito, categoria });
    if ('erro' in resultado) {
      mostrarAlerta(t('Erro'), resultado.erro);
      return;
    }
    if (divisao.erro) {
      mostrarAlerta(t('Erro'), divisao.erro);
      return;
    }
    const campos: CamposMensal = { ...resultado.campos };
    if (variavel !== !!aberta.variavel) campos.variavel = variavel;
    if (debitoAutomatico !== (aberta.debitoAutomatico !== false)) campos.debitoAutomatico = debitoAutomatico;
    const unidadeLimpa = unidade.trim();
    if (variavel && unidadeLimpa !== (aberta.unidadeConsumo ?? '')) campos.unidadeConsumo = unidadeLimpa || undefined;
    if (!variavel && aberta.unidadeConsumo) campos.unidadeConsumo = undefined;
    if (!mesmaDivisao(divisao.divisao, aberta.divisao)) {
      // Com divisão, o valor enviado é o total; sem ela, a chave com undefined deixa de dividir
      campos.divisao = divisao.divisao ?? undefined;
      campos.valor = parseValor(valor);
    }
    if (Object.keys(campos).length === 0) {
      onFechar();
      return;
    }
    setOcupado(true);
    try {
      await onGuardar(aberta, campos);
    } finally {
      setOcupado(false);
    }
  }

  async function apagar() {
    if (!aberta || ocupado) return;
    if (!(await confirmar(t('Apagar despesa'), mensagemApagarMensal(aberta.titulo, pagaEsteMes), 'Apagar'))) return;
    setOcupado(true);
    try {
      await onApagar(aberta);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <ModalFormulario visivel={despesa !== null} titulo={t('Editar despesa fixa')} onFechar={fechar}>
      <CampoTexto
        rotulo={t('Título')}
        placeholder={t('Título (ex: Renda, Luz, Água)')}
        value={titulo}
        onChangeText={setTitulo}
        accessibilityLabel={t('Título')}
      />

      <CampoTexto
        rotulo={variavel ? t('Valor estimado (€)') : t('Valor (€)')}
        placeholder={variavel ? t('Valor estimado (€)') : t('Valor (€)')}
        keyboardType="numeric"
        value={valor}
        onChangeText={setValor}
        accessibilityLabel={t('Valor em euros')}
      />

      <CampoTexto
        rotulo={t('Dia de débito (opcional)')}
        placeholder={t('Dia de débito (1-31)')}
        keyboardType="numeric"
        value={diaDebito}
        onChangeText={setDiaDebito}
        maxLength={2}
        accessibilityLabel={t('Dia de débito opcional, de 1 a 31')}
      />

      <SeletorCategoria valor={categoria} onChange={setCategoria} onLimpar={() => setCategoria(undefined)} />

      {!aberta?.divisao && <CampoValorVariavel variavel={variavel} onVariavel={setVariavel} unidade={unidade} onUnidade={setUnidade} />}

      {!!diaDebito.trim() && !variavel && <CampoDebitoAutomatico ligado={debitoAutomatico} onMudar={setDebitoAutomatico} />}

      {aberta && (
        <DivisaoGrupo
          key={aberta.id}
          total={parseValor(valor)}
          inicial={aberta.divisao ?? null}
          onChange={setDivisao}
          campos={
            <>
              <CampoTexto rotulo={t('Título')} placeholder={t('Título (ex: Renda, Luz, Água)')} value={titulo} onChangeText={setTitulo} />
              <CampoTexto rotulo={t('Valor (€)')} placeholder={t('Valor (€)')} keyboardType="numeric" value={valor} onChangeText={setValor} />
              <CampoTexto
                rotulo={t('Dia de débito (opcional)')}
                placeholder={t('Dia de débito (1-31)')}
                keyboardType="numeric"
                value={diaDebito}
                onChangeText={setDiaDebito}
                maxLength={2}
              />
              <SeletorCategoria valor={categoria} onChange={setCategoria} onLimpar={() => setCategoria(undefined)} />
            </>
          }
        />
      )}

      <Text style={f.nota}>{t('Vale a partir de agora. Os pagamentos já feitos mantêm o valor pago.')}</Text>
      {!!aberta?.fim && (
        <Text style={f.nota}>{t('Esta despesa foi apagada: {mes} é o último mês em que aparece.', { mes: nomeMes(aberta.fim) })}</Text>
      )}

      {/* Valor variável: paga-se com o valor da fatura */}
      {!modoFatura && !modoParcial && aberta?.variavel && !aberta.fim && emFalta > 0 && onPagarFatura && (
        <Botao
          titulo={t('Pagar fatura')}
          icone="receipt-outline"
          onPress={() => setModoFatura(true)}
          desativado={ocupado}
          style={f.botaoPrincipal}
        />
      )}

      {modoFatura && (
        <>
          <CampoTexto
            rotulo={t('Valor da fatura (€)')}
            placeholder={t('Quanto diz a fatura?')}
            keyboardType="numeric"
            value={valorFatura}
            onChangeText={setValorFatura}
            accessibilityLabel={t('Valor da fatura em euros')}
          />
          {!!aberta?.unidadeConsumo && (
            <>
              <CampoTexto
                rotulo={t('Consumo ({unidade})', { unidade: aberta.unidadeConsumo })}
                placeholder={t('Consumo da fatura (opcional)')}
                keyboardType="numeric"
                value={consumoFatura}
                onChangeText={setConsumoFatura}
                accessibilityLabel={t('Consumo da fatura em {unidade}', { unidade: aberta.unidadeConsumo })}
              />
              {!!ultimaFatura && <Text style={f.nota}>{textoUltimaFatura(ultimaFatura, aberta.unidadeConsumo)}</Text>}
              {!!textoPrecoPorUnidade(parseValor(valorFatura), parseValor(consumoFatura), aberta.unidadeConsumo) && (
                <Text style={f.nota}>{textoPrecoPorUnidade(parseValor(valorFatura), parseValor(consumoFatura), aberta.unidadeConsumo)}</Text>
              )}
            </>
          )}
          <View style={f.linhaBotoes}>
            <Botao titulo={t('Pagar')} icone="checkmark" onPress={confirmarPagamentoFatura} desativado={ocupado} style={f.botaoLinha} />
            <Botao
              variante="secundario"
              cor={cores.textoSecundario}
              titulo={t('Cancelar')}
              onPress={() => setModoFatura(false)}
              desativado={ocupado}
              style={f.botaoLinha}
            />
          </View>
        </>
      )}

      {/* Dividida com um grupo paga-se sempre o valor todo */}
      {!modoParcial && !aberta?.fim && !aberta?.divisao && emFalta > 0 && onDebitarParcial && (
        <Botao
          titulo={t('Pagar parcialmente')}
          icone="cash-outline"
          onPress={() => setModoParcial(true)}
          desativado={ocupado}
          style={f.botaoPrincipal}
        />
      )}

      {modoParcial && (
        <>
          <CampoTexto
            rotulo={t('Valor parcial (€)')}
            placeholder={t('Quanto vais pagar agora?')}
            keyboardType="numeric"
            value={valorParcial}
            onChangeText={setValorParcial}
            accessibilityLabel={t('Valor parcial em euros')}
          />

          <View style={f.linhaBotoes}>
            <Botao
              titulo={t('Confirmar')}
              icone="checkmark"
              onPress={confirmarPagamentoParcial}
              desativado={ocupado}
              style={f.botaoLinha}
            />
            <Botao
              variante="secundario"
              cor={cores.textoSecundario}
              titulo={t('Cancelar')}
              onPress={() => {
                setModoParcial(false);
                setValorParcial('');
              }}
              desativado={ocupado}
              style={f.botaoLinha}
            />
          </View>
        </>
      )}

      <Botao titulo={t('Guardar')} icone="checkmark" onPress={guardar} desativado={ocupado} style={f.botaoPrincipal} />

      <View style={f.linhaBotoes}>
        {/* Apagar: deixa de aparecer daqui para a frente, sem perder o histórico dos meses passados */}
        {!aberta?.fim && (
          <Botao
            variante="perigo"
            titulo={t('Apagar')}
            icone="trash-outline"
            onPress={apagar}
            desativado={ocupado}
            style={f.botaoLinha}
          />
        )}
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
