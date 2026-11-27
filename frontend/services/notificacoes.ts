import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { t } from '../i18n';
import { cores } from '../constants/tema';
import { calcularLembretes, Lembrete, mesesALembrar, PREFIXO_LEMBRETE } from '../utils/lembretes';
import { DespesasFixasDB, PagamentosDB, SalarioDB } from './database';
import { obterDefinicoes } from './definicoes';

// Notificações locais (só no telemóvel; na web não há): lembretes das despesas mensais por pagar e
// do dia de salário. O que agendar é calculado em utils/lembretes.ts; aqui só se fala com o
// expo-notifications. Isto não precisa de token nem de servidor. As notificações push do servidor são tratadas em
// services/push.ts; quando este telemóvel está registado nelas, os lembretes das despesas deixam de ser
// agendados aqui (ver definirPushDoServidor), para não avisar duas vezes.
//
// reagendarNotificacoes() é idempotente: cancela os lembretes que a app agendou e agenda os
// próximos. Corre ao iniciar sessão e sempre que a app volta a ficar ativa (components/GestorLembretes)
// e pode ser chamada pelos ecrãs depois de mudarem despesas, pagamentos ou o salário.

export const notificacoesDisponiveis = Platform.OS === 'android' || Platform.OS === 'ios';

// Canal do Android (Definições do sistema > Notificações > Finanças > Pagamentos)
export const CANAL_PAGAMENTOS = 'pagamentos';

// O Android aceita umas centenas de alarmes por app: com 2 meses nunca se chega perto, mas fica o limite
const MAXIMO_AGENDADAS = 60;

// O exemplo do botão "Testar notificação" (fora do prefixo dos lembretes: reagendar não o cancela)
const ID_TESTE = 'financas-teste';

let configurado: Promise<void> | null = null;

/** Mostrar as notificações também com a app aberta e criar o canal "Pagamentos". Pode ser chamada várias vezes. */
export function configurarNotificacoes(): Promise<void> {
  if (!notificacoesDisponiveis) return Promise.resolve();
  if (!configurado) {
    configurado = (async () => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      // No Android 13+ o canal tem de existir antes de pedir a permissão
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CANAL_PAGAMENTOS, {
          name: t('Pagamentos'),
          description: t('Lembretes das despesas por pagar e do dia de salário'),
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 200, 250],
          lightColor: cores.primaria,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
        });
      }
    })().catch((error) => {
      console.error('Erro ao configurar as notificações:', error);
      configurado = null;
    });
  }
  return configurado;
}

export type EstadoPermissao = 'concedida' | 'por-pedir' | 'negada';

export async function estadoPermissao(): Promise<EstadoPermissao> {
  if (!notificacoesDisponiveis) return 'negada';
  try {
    const estado = await Notifications.getPermissionsAsync();
    if (estado.granted) return 'concedida';
    return estado.canAskAgain ? 'por-pedir' : 'negada';
  } catch (error) {
    console.error('Erro ao ver a permissão das notificações:', error);
    return 'negada';
  }
}

/** Pede a permissão (Android 13+ mostra a janela do sistema). Devolve se ficou concedida. */
export async function pedirPermissao(): Promise<boolean> {
  if (!notificacoesDisponiveis) return false;
  await configurarNotificacoes();
  try {
    const atual = await Notifications.getPermissionsAsync();
    if (atual.granted) return true;
    if (!atual.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch (error) {
    console.error('Erro ao pedir a permissão das notificações:', error);
    return false;
  }
}

/** Cancela só os lembretes agendados por esta app (os ids começam por PREFIXO_LEMBRETE). */
export async function cancelarLembretes(): Promise<void> {
  if (!notificacoesDisponiveis) return;
  const agendadas = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    agendadas
      .filter((n) => n.identifier.startsWith(PREFIXO_LEMBRETE))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

async function agendar(lembrete: Lembrete): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: lembrete.id,
    content: {
      title: lembrete.titulo,
      body: lembrete.corpo,
      color: cores.primaria,
      data: { tipo: lembrete.tipo, url: lembrete.tipo === 'salario' ? '/(tabs)/salario' : '/(tabs)/despesas-fixas' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: lembrete.data,
      channelId: CANAL_PAGAMENTOS,
    },
  });
}

// ---- Push do servidor: evitar avisos duplicados ----
//
// O servidor avisa por push das despesas por pagar (e orçamentos, dívidas e objetivos). Com este
// telemóvel registado nessas notificações, os lembretes locais das despesas (véspera e dia do débito)
// não se agendam; o do dia de salário continua local (o servidor não o cobre). Se o registo falhar
// ou for desligado, os lembretes locais voltam sozinhos: são o plano B.

let pushDoServidor = false;

export function definirPushDoServidor(ativo: boolean): void {
  if (pushDoServidor === ativo) return;
  pushDoServidor = ativo;
  void reagendarNotificacoes();
}

// ---- Utilizador com sessão (os dados vêm da API em nome dele) ----

let utilizador: string | null = null;

/** Chamada por components/GestorLembretes quando a sessão muda. Sem sessão, os lembretes são cancelados. */
export function definirUtilizadorDosLembretes(userId: string | null): void {
  utilizador = userId;
}

// ---- Reagendar: um de cada vez (se pedirem outro a meio, corre mais um no fim com os dados novos) ----

let emCurso: Promise<Lembrete[] | null> | null = null;
let outraVez = false;

async function reagendarAgora(): Promise<Lembrete[] | null> {
  const definicoes = await obterDefinicoes();
  const uid = utilizador;
  if (!definicoes.notificacoes || !uid || (await estadoPermissao()) !== 'concedida') {
    await cancelarLembretes();
    return [];
  }
  await configurarNotificacoes();

  const [mesAtual, mesProximo] = mesesALembrar(new Date());
  let dados;
  try {
    const [fixas, pagamentosAtual, pagamentosProximo, salario] = await Promise.all([
      DespesasFixasDB.getAll(uid),
      PagamentosDB.getDoMes(uid, mesAtual),
      PagamentosDB.getDoMes(uid, mesProximo),
      SalarioDB.getConfig(uid),
    ]);
    dados = { fixas, pagamentos: { [mesAtual]: pagamentosAtual, [mesProximo]: pagamentosProximo }, salario };
  } catch (error) {
    // Sem ligação (ou o servidor a acordar): ficam os lembretes que já estavam agendados
    console.warn('Lembretes não atualizados (sem dados da API):', error);
    return null;
  }

  // A sessão pode ter mudado enquanto se esperava pela API
  if (utilizador !== uid) return null;

  const lembretes = calcularLembretes(
    dados,
    { noProprioDia: definicoes.lembrarNoDia, salario: definicoes.lembrarSalario },
    new Date()
  )
    // O servidor já avisa das despesas por pagar: só o salário fica local
    .filter((l) => !pushDoServidor || l.tipo === 'salario')
    .slice(0, MAXIMO_AGENDADAS);

  await cancelarLembretes();
  for (const lembrete of lembretes) {
    try {
      await agendar(lembrete);
    } catch (error) {
      console.error('Erro ao agendar o lembrete', lembrete.id, error);
    }
  }
  return lembretes;
}

/**
 * Cancela os lembretes agendados pela app e agenda os próximos (mês atual e seguinte), com as
 * definições deste telemóvel. Devolve os lembretes agendados, ou null se não foi possível atualizar
 * (web, sem ligação). Nunca lança erros: pode ser chamada sem await depois de qualquer mudança.
 */
export function reagendarNotificacoes(): Promise<Lembrete[] | null> {
  if (!notificacoesDisponiveis) return Promise.resolve(null);
  if (emCurso) {
    outraVez = true;
    return emCurso;
  }
  emCurso = (async () => {
    let resultado: Lembrete[] | null = null;
    do {
      outraVez = false;
      try {
        resultado = await reagendarAgora();
      } catch (error) {
        console.error('Erro ao reagendar os lembretes:', error);
        resultado = null;
      }
    } while (outraVez);
    return resultado;
  })().finally(() => {
    emCurso = null;
  });
  return emCurso;
}

/** Uma notificação de exemplo daqui a 5 segundos (para ver como aparece, mesmo fora da app). */
export async function testarNotificacao(): Promise<boolean> {
  if (!notificacoesDisponiveis || !(await pedirPermissao())) return false;
  await Notifications.scheduleNotificationAsync({
    identifier: ID_TESTE,
    content: {
      title: t('Renda sai amanhã — 550,00 €'),
      body: t('Exemplo: é assim que aparecem os lembretes das despesas por pagar.'),
      color: cores.primaria,
      data: { tipo: 'teste', url: '/(tabs)/definicoes' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: CANAL_PAGAMENTOS,
    },
  });
  return true;
}
