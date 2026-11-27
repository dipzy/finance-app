import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { cores, espaco, tipografia } from '../constants/tema';
import { useT } from '../i18n';
import { mesDe } from '../services/calculos';
import type { Mes, Poupanca } from '../services/tipos';
import { estadoEnvio } from '../utils/poupancasManuais';
import { Botao, formatarEuro } from './ui';

// As poupanças de contribuição manual: o estado do mês ("Por enviar este mês" / "Enviada dd/mm") e,
// no Início, uma linha compacta com o botão "Já enviei" (POST /api/poupancas/{id}/contribuir).

// Por enviar a âmbar, enviada a menta; nada nas automáticas
export function EstadoEnvioPoupanca({ poupanca, mes = mesDe() }: { poupanca: Poupanca; mes?: Mes }) {
  useT();
  const estado = estadoEnvio(poupanca, mes);
  if (!estado) return null;
  return <Text style={[styles.estado, { color: estado.porEnviar ? cores.aviso : cores.positivo }]}>{estado.texto}</Text>;
}

// "PPR · 50.00 € · por enviar" com "Já enviei"
export function LinhaPoupancaPorEnviar({
  poupanca,
  onEnviar,
  aEnviar,
  separada,
}: {
  poupanca: Poupanca;
  onEnviar: () => void;
  aEnviar?: boolean;
  separada?: boolean;
}) {
  const t = useT();
  return (
    <View style={[styles.linha, separada && styles.separada]}>
      <Ionicons name="wallet-outline" size={16} color={cores.aviso} />
      <Text style={styles.texto} numberOfLines={1}>
        {t('{nome} · {valor} · por enviar', { nome: poupanca.nome, valor: formatarEuro(poupanca.valorMensal ?? 0) })}
      </Text>
      <Botao
        variante="secundario"
        pequeno
        titulo={t('Já enviei')}
        icone="checkmark-outline"
        onPress={onEnviar}
        aCarregar={aEnviar}
        desativado={aEnviar}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  estado: {
    ...tipografia.nota,
    marginBottom: espaco.sm,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    paddingVertical: espaco.sm,
  },
  separada: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: cores.borda,
  },
  texto: {
    ...tipografia.secundario,
    flex: 1,
  },
});
