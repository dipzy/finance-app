import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { comAlfa, cores, espaco, fontes, raio } from '../constants/tema';
import { useT } from '../i18n';
// Diretamente de calculos.ts (e não de database.ts) para o componente não precisar do Firebase
import { mesAnterior, mesDe, mesSeguinte, nomeMes } from '../services/calculos';
import type { Mes } from '../services/tipos';

interface SeletorMesProps {
  mes: Mes;
  onChange: (mes: Mes) => void;
  // Último mês a que se pode ir (por defeito o atual: não há dados do futuro para ver)
  maximo?: Mes;
  // Primeiro mês a que se pode ir (por defeito, sem limite)
  minimo?: Mes;
  // Mostrar o atalho "Ir para <máximo>" (por defeito, sim)
  atalho?: boolean;
}

// "‹  Outubro 2026  ›"
export function SeletorMes({ mes, onChange, maximo = mesDe(), minimo, atalho = true }: SeletorMesProps) {
  const t = useT();
  const podeAvancar = mes < maximo;
  const podeRecuar = !minimo || mes > minimo;

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [styles.botao, pressed && podeRecuar && styles.premido]}
        onPress={() => onChange(mesAnterior(mes))}
        disabled={!podeRecuar}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={podeRecuar ? t('Mês anterior, {mes}', { mes: nomeMes(mesAnterior(mes)) }) : t('Mês anterior')}
        accessibilityState={{ disabled: !podeRecuar }}
      >
        <Ionicons name="chevron-back" size={22} color={podeRecuar ? cores.primaria : cores.desativado} />
      </Pressable>

      <View style={styles.centro}>
        <Text style={styles.mes} accessibilityRole="header" accessibilityLiveRegion="polite">
          {nomeMes(mes)}
        </Text>
        {/* Atalho para não ter de carregar várias vezes em › depois de ver meses antigos */}
        {atalho && podeAvancar && (
          <Pressable
            onPress={() => onChange(maximo)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('Ir para {mes}', { mes: nomeMes(maximo) })}
          >
            <Text style={styles.atalho}>{t('Ir para {mes}', { mes: nomeMes(maximo) })}</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        style={({ pressed }) => [styles.botao, pressed && podeAvancar && styles.premido]}
        onPress={() => onChange(mesSeguinte(mes))}
        disabled={!podeAvancar}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={podeAvancar ? t('Mês seguinte, {mes}', { mes: nomeMes(mesSeguinte(mes)) }) : t('Mês seguinte')}
        accessibilityState={{ disabled: !podeAvancar }}
      >
        <Ionicons name="chevron-forward" size={22} color={podeAvancar ? cores.primaria : cores.desativado} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: raio.lg,
    padding: espaco.xs,
    marginBottom: espaco.lg,
  },
  // 48x48: tamanho mínimo confortável para tocar com o dedo
  botao: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: raio.md,
  },
  premido: {
    backgroundColor: comAlfa(cores.primaria, 0.12),
  },
  centro: {
    flex: 1,
    alignItems: 'center',
  },
  mes: {
    fontFamily: fontes.titulo,
    fontSize: 18,
    color: cores.texto,
    letterSpacing: -0.2,
  },
  atalho: {
    fontFamily: fontes.corpoMedio,
    fontSize: 12,
    color: cores.primaria,
    marginTop: 2,
  },
});
