import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useIdioma } from '../i18n';
import { useDefinicoes } from '../services/definicoes';
import {
  configurarNotificacoes,
  definirUtilizadorDosLembretes,
  notificacoesDisponiveis,
  reagendarNotificacoes,
} from '../services/notificacoes';
import { carregarEstadoPush, pushDisponivel, registarPush, removerPush } from '../services/push';
import { rotaDaNotificacao } from '../utils/alertas';

// Mantém os lembretes (services/notificacoes.ts) em dia sem nenhum ecrã ter de se lembrar:
//   - ao iniciar ou terminar sessão (sem sessão ficam cancelados);
//   - sempre que a app volta a ficar ativa (no máximo uma vez por minuto: cada vez são 4 pedidos à API).
// Tocar numa notificação abre o ecrã do pagamento (Despesas Fixas ou Salário) ou, nas push do servidor,
// o `url` que elas trazem. Também regista este telemóvel nas push do servidor (services/push.ts) quando
// o utilizador as ligou nas Definições, e retira-o se as desligar.
// Não desenha nada; na web não faz nada.

const INTERVALO_MINIMO_MS = 60_000;

export function GestorLembretes() {
  const { user, isLoading } = useAuth();
  const uid = isLoading ? undefined : (user?.id ?? null);
  const ultimaVez = useRef(0);
  const definicoes = useDefinicoes();
  const idioma = useIdioma();
  const quer = definicoes ? definicoes.alertasServidor : undefined;

  // Canal "Pagamentos" e como mostrar as notificações com a app aberta
  useEffect(() => {
    if (notificacoesDisponiveis) configurarNotificacoes();
  }, []);

  // Push do servidor: este telemóvel já estava registado? (os lembretes locais ajustam-se logo)
  useEffect(() => {
    void carregarEstadoPush();
  }, []);

  // Registar (ou renovar, também ao mudar de idioma) com a sessão iniciada e a opção ligada; retirar se
  // a opção for desligada. Sem permissão do sistema não pede nada: a permissão pede-se nas Definições
  useEffect(() => {
    if (!pushDisponivel || !uid || quer === undefined) return;
    void (quer ? registarPush() : removerPush());
  }, [uid, quer, idioma]);

  // Sessão iniciada / terminada
  useEffect(() => {
    if (!notificacoesDisponiveis || uid === undefined) return;
    definirUtilizadorDosLembretes(uid);
    ultimaVez.current = Date.now();
    reagendarNotificacoes();
  }, [uid]);

  // A app voltou a ficar ativa: pode ter mudado o dia, ou ter havido débitos entretanto
  useEffect(() => {
    if (!notificacoesDisponiveis) return;
    const subscricao = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active' || Date.now() - ultimaVez.current < INTERVALO_MINIMO_MS) return;
      ultimaVez.current = Date.now();
      reagendarNotificacoes();
    });
    return () => subscricao.remove();
  }, []);

  // Tocar numa notificação (com a app aberta ou em segundo plano)
  useEffect(() => {
    if (!notificacoesDisponiveis) return;
    const subscricao = Notifications.addNotificationResponseReceivedListener((resposta) => {
      const rota = rotaDaNotificacao(resposta.notification.request.content.data);
      if (rota) router.push(rota as any);
    });
    return () => subscricao.remove();
  }, []);

  // A app foi aberta ao tocar numa notificação (estava fechada): abrir o ecrã dela, uma só vez, já com
  // a sessão iniciada (um pouco depois, para o redirecionamento do arranque não a atropelar)
  const abertaPelaNotificacao = useRef(false);
  useEffect(() => {
    if (!notificacoesDisponiveis || !uid || abertaPelaNotificacao.current) return;
    abertaPelaNotificacao.current = true;
    const ultima = Notifications.getLastNotificationResponse?.();
    const rota = ultima ? rotaDaNotificacao(ultima.notification.request.content.data) : null;
    if (!rota) return;
    const espera = setTimeout(() => router.push(rota as any), 600);
    return () => clearTimeout(espera);
  }, [uid]);

  return null;
}
