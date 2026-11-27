import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Header } from '../../components/Header';
import { LinhaAlerta } from '../../components/LinhaAlerta';
import { SideMenu } from '../../components/SideMenu';
import { Botao, Cartao, Ecra, Etiqueta } from '../../components/ui';
import { cores, espaco, tipografia } from '../../constants/tema';
import { useT } from '../../i18n';
import { atualizarAlertasSeNecessario, marcarAlertasVistos, useAlertas } from '../../services/alertas';

// Alertas (calculados na API): o que pede atenção, do mais grave para o menos grave. Tocar abre
// o ecrã onde se resolve. O mesmo cálculo gera as notificações push (ver services/push.ts)
export default function AlertasScreen() {
  const t = useT();
  const [menuVisible, setMenuVisible] = useState(false);
  const { alertas, erro, aCarregar, recarregar } = useAlertas(false);
  useFocusEffect(
    useCallback(() => {
      void atualizarAlertasSeNecessario();
    }, [])
  );
  // Abrir o ecrã é ver os alertas: o número do sino some (e volta se aparecer algum novo)
  useEffect(() => {
    if (alertas) marcarAlertasVistos(alertas);
  }, [alertas]);

  return (
    <Ecra
      cabecalho={
        <>
          <Header title={t('Alertas')} onMenuPress={() => setMenuVisible(true)} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} />
        </>
      }
    >
      <Text style={styles.ajuda}>
        {t('Orçamentos perto do limite, pagamentos a vencer ou em atraso e objetivos atrasados. Toca num alerta para o resolver.')}
      </Text>

      {aCarregar && <ActivityIndicator style={styles.estado} color={cores.primaria} />}
      {erro && (
        <View style={styles.estado}>
          <Etiqueta texto={t('Não foi possível atualizar os alertas.')} cor={cores.aviso} icone="alert-circle-outline" />
          <Botao variante="secundario" pequeno icone="refresh-outline" titulo={t('Tentar outra vez')} onPress={recarregar} style={styles.tentar} />
        </View>
      )}

      {alertas && alertas.length === 0 && (
        <Cartao>
          <Text style={styles.vazio}>{t('Sem alertas por agora. Está tudo em ordem.')}</Text>
        </Cartao>
      )}
      {alertas && alertas.length > 0 && (
        <Cartao>
          {alertas.map((alerta, i) => (
            <LinhaAlerta key={`${alerta.tipo}-${alerta.referencia ?? i}`} alerta={alerta} separada={i > 0} />
          ))}
        </Cartao>
      )}
    </Ecra>
  );
}

const styles = StyleSheet.create({
  ajuda: { ...tipografia.nota, color: cores.textoSecundario, marginTop: espaco.md, marginBottom: espaco.md },
  estado: { padding: espaco.lg, alignItems: 'center' },
  tentar: { marginTop: espaco.sm },
  vazio: { ...tipografia.secundario, textAlign: 'center', fontStyle: 'italic', padding: espaco.md },
});
