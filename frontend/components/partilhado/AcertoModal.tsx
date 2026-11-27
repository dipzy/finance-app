import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { cores, espaco, tipografia } from '../../constants/tema';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../i18n';
import { mensagemDaApi, type GrupoMembroDto } from '../../services/grupos';
import { PartilhadoDB, type TransferenciaDto } from '../../services/partilhado';
import { textoHoje } from '../../utils/ecrasDespesas';
import { lerDataEscrita, parseValor } from '../../utils/formatos';
import { confirmar } from '../../utils/confirmar';
import { mostrarAlerta } from '../../utils/helpers';
import { CampoData } from '../CampoData';
import { ModalFormulario, estilosFormulario } from '../ModalFormulario';
import { Botao, CampoTexto, Chip, formatarEuro } from '../ui';

const COR = cores.positivo;

interface Props {
  visivel: boolean;
  grupoId: string;
  membros: GrupoMembroDto[];
  /** Um pagamento sugerido (dos saldos) para começar preenchido. */
  sugestao?: TransferenciaDto | null;
  onFechar: () => void;
  onGuardado: () => void;
}

// Registar um pagamento que eu fiz a outra pessoa do grupo ("paguei à Ana"). O dinheiro sai da
// minha conta; só entra na dela quando ela confirmar que recebeu. Só quem paga regista: ninguém mexe na conta
// de outra pessoa. Antes de registar pergunta-se se o pagamento já foi mesmo feito (a outra pessoa é avisada)
export function AcertoModal({ visivel, grupoId, membros, sugestao, onFechar, onGuardado }: Props) {
  const t = useT();
  const { user } = useAuth();
  const [outro, setOutro] = useState<string | undefined>();
  const [valor, setValor] = useState('');
  const [data, setData] = useState(textoHoje());
  const [aGuardar, setAGuardar] = useState(false);
  // A ref trava dois toques seguidos (o estado só muda no render seguinte)
  const emCurso = useRef(false);

  const outros = membros.filter((m) => !m.souEu);

  useEffect(() => {
    if (!visivel) return;
    if (sugestao && user?.id && sugestao.deUid === user.id) {
      setOutro(sugestao.paraUid);
      setValor(sugestao.valor.toFixed(2).replace('.', ','));
    } else {
      setOutro(outros.length === 1 ? outros[0].uid : undefined);
      setValor('');
    }
    setData(textoHoje());
  }, [visivel, sugestao]);

  async function guardar() {
    if (emCurso.current) return;
    if (!user?.id || !outro) {
      mostrarAlerta(t('Erro'), t('Escolhe a pessoa.'));
      return;
    }
    const quanto = parseValor(valor);
    if (!(quanto > 0)) {
      mostrarAlerta(t('Erro'), t('Escreve o valor.'));
      return;
    }
    const dataLida = lerDataEscrita(data);
    if ('erro' in dataLida) {
      mostrarAlerta(t('Erro'), dataLida.erro);
      return;
    }

    const nome = outros.find((m) => m.uid === outro)?.nome ?? '';
    const sim = await confirmar(
      t('Confirmas que já pagaste?'),
      t('Confirmas que já pagaste {valor} a {nome}? Sai já da tua conta e {nome} é avisado para confirmar que recebeu.', { valor: formatarEuro(quanto), nome }),
      'Confirmar'
    );
    if (!sim) return;

    emCurso.current = true;
    setAGuardar(true);
    try {
      await PartilhadoDB.criarAcerto(grupoId, {
        deUid: user.id,
        paraUid: outro,
        valor: quanto,
        data: dataLida.iso,
      });
      onGuardado();
      onFechar();
    } catch (error) {
      console.error('Erro ao registar o acerto:', error);
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível registar o pagamento.')));
    } finally {
      emCurso.current = false;
      setAGuardar(false);
    }
  }

  const nomeOutro = outros.find((m) => m.uid === outro)?.nome;

  return (
    <ModalFormulario visivel={visivel} titulo={t('Acertar contas')} onFechar={onFechar}>
      <Text style={estilosFormulario.label}>{t('A quem pagaste')}</Text>
      <View style={styles.chips}>
        {outros.map((m) => (
          <Chip key={m.uid} rotulo={m.nome} ativo={outro === m.uid} cor={COR} onPress={() => setOutro(m.uid)} />
        ))}
      </View>

      <View style={styles.espacoAcima}>
        <CampoTexto rotulo={t('Valor (€)')} value={valor} onChangeText={setValor} keyboardType="decimal-pad" placeholder="0,00" />
      </View>
      <Text style={estilosFormulario.label}>{t('Data')}</Text>
      <CampoData valor={data} onChange={setData} cor={COR} />

      {!!nomeOutro && (
        <Text style={[estilosFormulario.nota, styles.espacoAcima]}>
          {t('Sai da tua conta e entra na conta de {nome}.', { nome: nomeOutro })}
        </Text>
      )}
      <Text style={estilosFormulario.nota}>{t('Se alguém te pagou, é essa pessoa que regista o pagamento.')}</Text>

      <Botao
        titulo={aGuardar ? t('A guardar…') : t('Registar pagamento')}
        onPress={guardar}
        aCarregar={aGuardar}
        desativado={aGuardar}
        style={estilosFormulario.botaoPrincipal}
      />
      <Botao titulo={t('Cancelar')} variante="secundario" onPress={onFechar} />
    </ModalFormulario>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm },
  espacoAcima: { marginTop: espaco.md },
  texto: { ...tipografia.corpo },
});
