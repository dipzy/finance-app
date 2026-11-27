import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { brilho, comAlfa, cores, espaco, fontes, gradientes, raio, tipografia } from '../../constants/tema';
import { useT } from '../../i18n';
import { Icone } from './Icone';
import type { IconeOuEmoji } from './tipos';
import { formatarEuro } from './ValorEuro';

export type VarianteSaldo = 'primario' | 'violeta' | 'positivo' | 'negativo' | 'aviso' | 'laranja';

// Degradê e cor de acento (borda, brilho, ícone) de cada variante
const VARIANTES: Record<VarianteSaldo, { degrade: typeof gradientes.heroPrimario; acento: string }> = {
  primario: { degrade: gradientes.heroPrimario, acento: cores.primaria },
  violeta: { degrade: gradientes.heroVioleta, acento: cores.violetaTexto },
  positivo: { degrade: gradientes.heroPositivo, acento: cores.positivo },
  negativo: { degrade: gradientes.heroNegativo, acento: cores.negativo },
  aviso: { degrade: gradientes.heroAviso, acento: cores.aviso },
  laranja: { degrade: gradientes.heroLaranja, acento: cores.laranja },
};

interface CartaoSaldoProps {
  rotulo: string;
  valor: number | undefined; // undefined enquanto carrega: mostra "…"
  subtitulo?: string;
  variante?: VarianteSaldo;
  icone?: IconeOuEmoji;
  compacto?: boolean; // dois cartões lado a lado (número mais pequeno)
  // Um saldo negativo passa o cartão a coral; num total de despesas (sempre >= 0) não interessa
  alertaNegativo?: boolean;
  children?: ReactNode; // linhas extra por baixo (ex.: Pago / Por pagar)
  style?: StyleProp<ViewStyle>;
}

// Cartão de destaque de um saldo ou total: degradê translúcido, número grande com brilho
export function CartaoSaldo({
  rotulo,
  valor,
  subtitulo,
  variante = 'primario',
  icone,
  compacto,
  alertaNegativo = true,
  children,
  style,
}: CartaoSaldoProps) {
  const negativo = alertaNegativo && valor !== undefined && valor < 0;
  const { degrade, acento } = VARIANTES[negativo ? 'negativo' : variante];
  const t = useT();
  const texto = formatarEuro(valor);

  return (
    <View
      style={[
        styles.cartao,
        compacto && styles.compacto,
        { borderColor: comAlfa(acento, 0.35), boxShadow: brilho(acento, 0.18, 28) },
        style,
      ]}
    >
      <LinearGradient colors={degrade} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.degrade} />
      <View style={styles.topo}>
        {icone && <Icone nome={icone} size={compacto ? 14 : 16} color={acento} />}
        <Text style={styles.rotulo} numberOfLines={1}>
          {t(rotulo)}
        </Text>
      </View>
      <Text
        style={[
          styles.valor,
          compacto && styles.valorCompacto,
          { color: negativo ? cores.negativo : cores.texto, textShadowColor: comAlfa(acento, 0.55) },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        accessibilityLabel={`${t(rotulo)}: ${valor === undefined ? t('a carregar') : `${valor.toFixed(2)} euros`}`}
      >
        {texto}
      </Text>
      {!!subtitulo && <Text style={styles.subtitulo}>{t(subtitulo)}</Text>}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  cartao: {
    borderRadius: raio.xl,
    borderWidth: 1,
    paddingVertical: espaco.xl,
    paddingHorizontal: espaco.xl,
    marginBottom: espaco.md,
    alignItems: 'center',
    backgroundColor: cores.fundoAlto,
  },
  compacto: {
    flex: 1,
    paddingVertical: espaco.lg,
    paddingHorizontal: espaco.md,
    marginBottom: 0,
  },
  degrade: {
    ...StyleSheet.absoluteFill,
    borderRadius: raio.xl,
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rotulo: {
    ...tipografia.rotulo,
    color: cores.textoHero,
    flexShrink: 1,
  },
  valor: {
    ...tipografia.valorGrande,
    marginTop: espaco.sm,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  valorCompacto: {
    fontFamily: fontes.numero,
    fontSize: 22,
    marginTop: 6,
  },
  subtitulo: {
    ...tipografia.nota,
    color: cores.textoHero,
    marginTop: espaco.xs,
    textAlign: 'center',
  },
});
