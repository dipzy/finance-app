import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Botao, Cartao, Ecra } from '@/components/ui';
import { comAlfa, cores, espaco, tipografia } from '@/constants/tema';
import { useT } from '../i18n';

export default function NotFoundScreen() {
  const t = useT();
  return (
    <>
      <Stack.Screen options={{ title: t('Ups!'), headerShown: false }} />
      <Ecra centrarVertical>
        <Cartao brilho style={styles.container}>
          <View style={styles.icone}>
            <Ionicons name="planet-outline" size={34} color={cores.primaria} />
          </View>
          <Text style={styles.title}>{t('Este ecrã não existe.')}</Text>
          <Text style={styles.texto}>{t('O endereço pode estar errado ou a página já não existir.')}</Text>

          <Botao titulo={t('Voltar ao início')} icone="home-outline" onPress={() => router.navigate('/(tabs)/welcome')} style={styles.link} />
        </Cartao>
      </Ecra>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: espaco.xxl,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  icone: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: comAlfa(cores.primaria, 0.1),
    borderWidth: 1,
    borderColor: comAlfa(cores.primaria, 0.3),
    marginBottom: espaco.lg,
  },
  title: {
    ...tipografia.tituloEcra,
    fontSize: 20,
    textAlign: 'center',
  },
  texto: {
    ...tipografia.secundario,
    textAlign: 'center',
    marginTop: espaco.sm,
  },
  link: {
    marginTop: espaco.xl,
    alignSelf: 'stretch',
  },
});
