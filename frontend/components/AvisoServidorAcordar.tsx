import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { comAlfa, cores, espaco, layout, raio, tipografia } from '../constants/tema';
import { useT } from '../i18n';
import { aoAcordarServidor, servidorAAcordar, servidorAAcordarDesde, tentativaDeAcordar } from '../services/servidor';

/** Segundos desde `desde` (Date.now), nunca negativos. */
export function segundosDesde(desde: number | null, agora = Date.now()): number {
  return desde === null ? 0 : Math.max(0, Math.floor((agora - desde) / 1000));
}

// Aviso no cabeçalho enquanto a API arranca (no Render grátis adormece e o 1.º pedido demora até ~1 minuto).
// Não bloqueia nada: os ecrãs continuam a abrir com o que já têm e os gastos novos vão para a fila offline.
// O cliente da API (services/api.ts) repete os pedidos sozinho com espera crescente
export function AvisoServidorAcordar() {
  const t = useT();
  const [aAcordar, setAAcordar] = useState(servidorAAcordar);
  const [segundos, setSegundos] = useState(() => segundosDesde(servidorAAcordarDesde()));

  useEffect(() => {
    setAAcordar(servidorAAcordar());
    return aoAcordarServidor(setAAcordar);
  }, []);

  // O contador só corre enquanto o aviso está à vista
  useEffect(() => {
    if (!aAcordar) return;
    const atualizar = () => setSegundos(segundosDesde(servidorAAcordarDesde()));
    atualizar();
    const intervalo = setInterval(atualizar, 1000);
    return () => clearInterval(intervalo);
  }, [aAcordar]);

  if (!aAcordar) return null;
  const tentativa = tentativaDeAcordar();

  return (
    <View style={styles.faixa} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="aviso-servidor-acordar">
      <ActivityIndicator size="small" color={cores.primaria} />
      <View style={styles.textos}>
        <Text style={styles.titulo}>{t('A acordar o servidor…')}</Text>
        <Text style={styles.texto}>
          {tentativa > 0
            ? t('{s} s · a tentar outra vez (tentativa {n}). A app continua a funcionar.', { s: segundos, n: tentativa })
            : t('{s} s · pode demorar até um minuto. A app continua a funcionar.', { s: segundos })}
        </Text>
      </View>
      <Ionicons name="cloud-outline" size={18} color={cores.primaria} accessibilityElementsHidden importantForAccessibility="no" />
    </View>
  );
}

const styles = StyleSheet.create({
  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    width: '100%',
    maxWidth: layout.larguraMaxima,
    alignSelf: 'center',
    marginTop: espaco.sm,
    paddingVertical: espaco.sm,
    paddingHorizontal: espaco.md,
    borderRadius: raio.md,
    backgroundColor: comAlfa(cores.primaria, 0.08),
    borderWidth: 1,
    borderColor: comAlfa(cores.primaria, 0.28),
  },
  textos: { flex: 1 },
  titulo: { ...tipografia.corpoMedio, fontSize: 13, color: cores.texto },
  texto: { ...tipografia.nota },
});
