import { StyleSheet, Text, View } from 'react-native';
import { cores, espaco, tipografia } from '../constants/tema';
import { useT } from '../i18n';
import { eConfirmacaoValida, PALAVRA_APAGAR } from '../utils/apagarConta';
import { estilosFormulario, ModalFormulario } from './ModalFormulario';
import { Botao, CampoTexto } from './ui';

interface Props {
  visivel: boolean;
  texto: string;
  onMudarTexto: (texto: string) => void;
  aApagar: boolean;
  onConfirmar: () => void;
  onFechar: () => void;
}

// Primeira confirmação de "Apagar todos os dados e a conta": explica o que se perde e só deixa
// avançar quem escrever APAGAR. A segunda confirmação (um alerta) vem a seguir, em Definições.
export function ApagarContaModal({ visivel, texto, onMudarTexto, aApagar, onConfirmar, onFechar }: Props) {
  const t = useT();
  const pode = eConfirmacaoValida(texto) && !aApagar;
  const perdas = [
    t('Todos os gastos, despesas fixas e anuais, dívidas, poupanças, orçamentos e objetivos'),
    t('O saldo, o salário, o cartão de alimentação e o histórico de alterações'),
    t('As regras de categorização e os dispositivos que recebem avisos'),
    t('A tua conta de acesso (email e password)'),
  ];

  return (
    <ModalFormulario visivel={visivel} titulo={t('Apagar todos os dados e a conta')} onFechar={onFechar}>
      <Text style={styles.aviso}>{t('Isto não se pode desfazer. Vais perder para sempre:')}</Text>
      <View style={styles.lista}>
        {perdas.map((perda) => (
          <Text key={perda} style={styles.item}>
            {'• '}
            {perda}
          </Text>
        ))}
      </View>
      <Text style={styles.nota}>
        {t('Nos grupos com mais pessoas, o que já foi partilhado com elas fica (a tua parte passa a "Utilizador removido"). Se não queres perder os teus dados, exporta-os para Excel antes.')}
      </Text>
      <CampoTexto
        rotulo={t('Escreve {palavra} para confirmar', { palavra: PALAVRA_APAGAR })}
        value={texto}
        onChangeText={onMudarTexto}
        placeholder={PALAVRA_APAGAR}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Botao
        titulo={aApagar ? t('A apagar…') : t('Apagar tudo')}
        variante="perigo"
        icone="trash-outline"
        onPress={onConfirmar}
        desativado={!pode}
        aCarregar={aApagar}
        style={estilosFormulario.botaoPrincipal}
      />
      <Botao titulo={t('Cancelar')} variante="fantasma" onPress={onFechar} desativado={aApagar} />
    </ModalFormulario>
  );
}

const styles = StyleSheet.create({
  aviso: { ...tipografia.corpoMedio, color: cores.negativo, marginBottom: espaco.sm },
  lista: { marginBottom: espaco.md, gap: 4 },
  item: { ...tipografia.secundario, lineHeight: 20 },
  nota: { ...tipografia.nota, marginBottom: espaco.lg },
});
