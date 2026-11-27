import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { cores, espaco, tipografia } from '../constants/tema';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../i18n';
import { SalarioDB } from '../services/database';
import { mensagemDaApi } from '../services/grupos';
import { mostrarAlerta, parseValor } from '../utils/helpers';
import { Botao, CampoTexto, Cartao, TituloSecao } from './ui';

// Com o recebimento manual ligado (menu Salário), o salário não entra sozinho: depois do dia de recebimento, e até ser
// marcado, aparece aqui. "Já recebi" faz entrar o salário (como o automático) com o valor que entrou de facto, que pode
// ser diferente do configurado. Sem nada por receber não aparece

export function SalarioPorReceber({
  dia,
  valorConfigurado,
  onRecebido,
}: {
  dia: number; // o dia em que devia ter entrado
  valorConfigurado: string;
  onRecebido: () => void | Promise<void>;
}) {
  const t = useT();
  const { user } = useAuth();
  const [valor, setValor] = useState('');
  const [aMarcar, setAMarcar] = useState(false);

  async function marcar() {
    if (!user?.id || aMarcar) return;
    // Vazio: entra o valor configurado
    const escrito = valor.trim() ? parseValor(valor) : undefined;
    if (escrito !== undefined && !(escrito > 0)) {
      mostrarAlerta(t('Erro'), t('Escreve o valor que entrou, maior do que zero.'));
      return;
    }

    setAMarcar(true);
    try {
      await SalarioDB.receberManual(user.id, escrito);
      setValor('');
      await onRecebido();
    } catch (error) {
      console.error('Erro ao marcar o salário como recebido:', error);
      mostrarAlerta(t('Erro'), mensagemDaApi(error, t('Não foi possível registar o salário.')));
    } finally {
      setAMarcar(false);
    }
  }

  return (
    <Cartao acento={cores.aviso}>
      <TituloSecao titulo={t('Salário por receber')} icone="cash-outline" cor={cores.aviso} />
      <Text style={styles.nota}>
        {t('Devia ter entrado no dia {dia} e ainda não o marcaste. Escreve o valor que entrou, ou deixa vazio para o configurado ({valor} €).', {
          dia,
          valor: valorConfigurado,
        })}
      </Text>
      <CampoTexto
        rotulo={t('Valor que entrou (€)')}
        keyboardType="numeric"
        value={valor}
        onChangeText={setValor}
        placeholder={t('Agora: {valor}', { valor: `${valorConfigurado} €` })}
        accessibilityLabel={t('Valor do salário que entrou, em euros')}
      />
      <Botao
        titulo={t('Já recebi')}
        icone="checkmark-outline"
        onPress={marcar}
        aCarregar={aMarcar}
        desativado={aMarcar}
        accessibilityLabel={t('Já recebi o salário deste mês')}
        style={styles.botao}
      />
    </Cartao>
  );
}

const styles = StyleSheet.create({
  nota: {
    ...tipografia.secundario,
    marginBottom: espaco.md,
  },
  botao: {
    marginTop: espaco.sm,
  },
});
