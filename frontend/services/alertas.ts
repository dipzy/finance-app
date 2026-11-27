import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { idiomaAtual, useIdioma } from '../i18n';
import { type Alerta, chaveAlerta, ordenarAlertas } from '../utils/alertas';
import { api } from './api';

// Alertas proativos (GET /api/alertas), calculados na API: orçamentos perto do limite ou excedidos,
// despesas e prestações de dívidas a vencer ou vencidas, objetivos atrasados. Os textos (titulo e
// mensagem) já vêm no idioma da app (Accept-Language). O mesmo cálculo gera as notificações push
// do servidor (services/push.ts): aqui é o que se vê dentro da app (cartão no Início e ecrã Alertas).

export type { Alerta, SeveridadeAlerta, TipoAlerta } from '../utils/alertas';

export const AlertasDB = {
  async listar(): Promise<Alerta[]> {
    return ordenarAlertas((await api.get<Alerta[]>('/api/alertas')) ?? []);
  },
};

// ---- Estado partilhado: o painel, o menu e o ecrã Alertas leem o mesmo pedido ----

// Os alertas mudam devagar (um pedido por minuto, no máximo, sem contar o "atualizar" à mão)
const VALIDADE_MS = 60_000;

interface Estado {
  alertas: Alerta[] | null;
  erro: boolean;
  idioma: string;
  quando: number;
}

let atual: Estado = { alertas: null, erro: false, idioma: '', quando: 0 };
let emCurso: Promise<void> | null = null;
const ouvintes = new Set<(estado: Estado) => void>();

function mudar(novo: Estado) {
  atual = novo;
  ouvintes.forEach((o) => o(novo));
}

/** Lê os alertas à API (e avisa quem os mostra). Nunca lança erros: fica "erro" no estado. */
export function atualizarAlertas(): Promise<void> {
  if (emCurso) return emCurso;
  const idioma = idiomaAtual();
  emCurso = AlertasDB.listar()
    .then((alertas) => mudar({ alertas, erro: false, idioma, quando: Date.now() }))
    .catch((error) => {
      // Sem ligação ou sem sessão: ficam os últimos que se conheciam
      console.warn('Erro ao carregar os alertas:', error);
      mudar({ ...atual, erro: true, quando: 0 });
    })
    .finally(() => {
      emCurso = null;
    });
  return emCurso;
}

// ---- Alertas já vistos (o emblema do sino some ao abrir o ecrã; um alerta novo volta a acendê-lo) ----

const CHAVE_VISTOS = '@financas:alertas-vistos';
let vistos: ReadonlySet<string> = new Set();
const ouvintesVistos = new Set<(v: ReadonlySet<string>) => void>();
let vistosCarregados = false;

async function carregarVistos() {
  if (vistosCarregados) return;
  vistosCarregados = true;
  try {
    const guardado = JSON.parse((await AsyncStorage.getItem(CHAVE_VISTOS)) ?? '[]');
    if (Array.isArray(guardado) && guardado.length > 0) {
      mudarVistos(new Set([...vistos, ...guardado.filter((c): c is string => typeof c === 'string')]), false);
    }
  } catch {
    // sem armazenamento: só se lembra enquanto a app está aberta
  }
}

function mudarVistos(novos: ReadonlySet<string>, guardar = true) {
  vistos = novos;
  ouvintesVistos.forEach((o) => o(novos));
  if (guardar) void AsyncStorage.setItem(CHAVE_VISTOS, JSON.stringify([...novos])).catch(() => undefined);
}

/** Marca estes alertas como vistos (ao abrir o ecrã Alertas). */
export function marcarAlertasVistos(alertas: Alerta[]): void {
  const chaves = alertas.map(chaveAlerta);
  if (chaves.every((c) => vistos.has(c))) return;
  // Só guarda os que ainda existem, para a lista não crescer para sempre
  mudarVistos(new Set(chaves));
}

/** Esquece os alertas (ao terminar a sessão, para o próximo utilizador não ver os do anterior). */
export function limparAlertas(): void {
  mudar({ alertas: null, erro: false, idioma: '', quando: 0 });
  vistos = new Set();
  vistosCarregados = false;
  ouvintesVistos.forEach((o) => o(vistos));
  void AsyncStorage.removeItem(CHAVE_VISTOS).catch(() => undefined);
}

/** Pede à API só se os que se conhecem já têm mais de um minuto (ou são de outro idioma). */
export function atualizarAlertasSeNecessario(): Promise<void> {
  return desatualizado() ? atualizarAlertas() : Promise.resolve();
}

const desatualizado = () => !atual.alertas || atual.erro || Date.now() - atual.quando > VALIDADE_MS || atual.idioma !== idiomaAtual();

/**
 * Os alertas atuais, sempre atualizados. `ativo = false` só ouve (não pede à API): o menu só pede
 * quando abre. Um pedido novo só sai se o último tiver mais de um minuto ou for de outro idioma.
 */
export function useAlertas(ativo = true) {
  const idioma = useIdioma();
  const [estado, setEstado] = useState<Estado>(atual);
  const [vistosAgora, setVistosAgora] = useState(vistos);

  useEffect(() => {
    setEstado(atual);
    ouvintes.add(setEstado);
    setVistosAgora(vistos);
    ouvintesVistos.add(setVistosAgora);
    void carregarVistos();
    return () => {
      ouvintes.delete(setEstado);
      ouvintesVistos.delete(setVistosAgora);
    };
  }, []);

  useEffect(() => {
    if (ativo && desatualizado()) void atualizarAlertas();
  }, [ativo, idioma]);

  const recarregar = useCallback(() => atualizarAlertas(), []);
  return { alertas: estado.alertas, vistos: vistosAgora, erro: estado.erro, aCarregar: estado.alertas === null && !estado.erro, recarregar };
}

// Só para os testes
export function __reporAlertas() {
  atual = { alertas: null, erro: false, idioma: '', quando: 0 };
  emCurso = null;
  ouvintes.clear();
  vistos = new Set();
  vistosCarregados = false;
  ouvintesVistos.clear();
}
