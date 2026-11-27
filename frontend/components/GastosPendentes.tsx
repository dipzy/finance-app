import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useT } from '../i18n';
import { comAlfa, cores, espaco, raio, tipografia } from '../constants/tema';
import { emitir } from '../services/eventos';
import { aoMudarFila, listarPendentes, type GastoPendente } from '../services/filaOffline';
import { infoCategoria } from '../utils/categorias';
import { diaEMes } from '../utils/ecrasDespesas';
import { ValorEuro } from './ui';

// Os gastos registados sem internet, que ainda não chegaram à API (services/filaOffline.ts).
// Aparecem nas listas com uma nuvem riscada; os saldos não os incluem (ainda não saíram da conta).

/** Os gastos por enviar deste utilizador (atualiza-se sozinho quando a fila muda). */
export function useGastosPendentes(userId: string | undefined): GastoPendente[] {
  const [pendentes, setPendentes] = useState<GastoPendente[]>([]);

  useEffect(() => {
    if (!userId) {
      setPendentes([]);
      return;
    }
    let ativo = true;
    const ler = () => {
      listarPendentes(userId).then((lista) => {
        if (ativo) setPendentes(lista);
      });
    };
    ler();
    const deixar = aoMudarFila(ler);
    return () => {
      ativo = false;
      deixar();
    };
  }, [userId]);

  return pendentes;
}

/** O mês (aaaa-mm) de um gasto por enviar: o da data, ou o do dia em que foi registado. */
export const mesDoPendente = (p: GastoPendente) => (p.gasto.data ?? p.criadoEm).slice(0, 7);

// Uma linha "por enviar": tocar abre a folha do gasto para o corrigir ou apagar
export function LinhaGastoPendente({ pendente }: { pendente: GastoPendente }) {
  const t = useT();
  const categoria = infoCategoria(pendente.gasto.categoria);
  const cor = pendente.erro ? cores.negativo : cores.aviso;
  const estado = pendente.erro ? t('Não enviado: {erro}', { erro: pendente.erro }) : t('Por enviar (sem internet)');
  const data = pendente.gasto.data ? diaEMes(pendente.gasto.data) : '';

  return (
    <Pressable
      style={({ pressed }) => [styles.linha, { borderColor: comAlfa(cor, 0.35) }, pressed && styles.premida]}
      onPress={() => emitir('abrirGastoRapido', { idPendente: pendente.id })}
      accessibilityRole="button"
      accessibilityLabel={t('{titulo}, {valor} euros, {estado}', {
        titulo: pendente.gasto.titulo,
        valor: pendente.gasto.valor.toFixed(2),
        estado,
      })}
      accessibilityHint={t('Abre para editar ou apagar')}
    >
      <View style={[styles.icone, { backgroundColor: comAlfa(cor, 0.12) }]}>
        <Ionicons name="cloud-offline-outline" size={16} color={cor} />
      </View>
      <View style={styles.textos}>
        <Text style={styles.titulo} numberOfLines={1}>
          {pendente.gasto.titulo}
        </Text>
        <Text style={[styles.nota, { color: cor }]} numberOfLines={2}>
          {estado}
          <Text style={styles.notaMuda}>{` · ${t(categoria.nome)}${data ? ` · ${data}` : ''}`}</Text>
        </Text>
      </View>
      <ValorEuro valor={pendente.gasto.valor} tipo="saida" style={styles.valor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    backgroundColor: cores.superficie,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: espaco.sm,
    paddingHorizontal: espaco.md,
    borderRadius: raio.md,
    marginBottom: espaco.sm,
  },
  premida: {
    backgroundColor: cores.superficiePremida,
  },
  icone: {
    width: 32,
    height: 32,
    borderRadius: raio.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: espaco.md,
  },
  textos: {
    flex: 1,
    marginRight: espaco.sm,
  },
  titulo: {
    ...tipografia.corpoMedio,
  },
  nota: {
    ...tipografia.nota,
    marginTop: 2,
  },
  notaMuda: {
    color: cores.textoMudo,
  },
  valor: {
    fontSize: 15,
  },
});
