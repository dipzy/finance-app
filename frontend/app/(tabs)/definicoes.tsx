import { type Href, router, useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { Linking, Platform, StyleSheet, Switch, Text, View } from 'react-native';
import { ApagarContaModal } from '../../components/ApagarContaModal';
import { Header } from '../../components/Header';
import { ModalFormulario } from '../../components/ModalFormulario';
import { SideMenu } from '../../components/SideMenu';
import { Botao, Cartao, Chip, Ecra, Etiqueta, TituloSecao } from '../../components/ui';
import { PREFERENCIAS_TEMA, type PreferenciaTema } from '../../constants/esquema';
import { comAlfa, cores, espaco, fontes, tipografia } from '../../constants/tema';
import {
  autenticar,
  bloqueioDisponivel,
  permitirSaidaTemporaria,
  terminarSaidaTemporaria,
  verificarSuporte,
  SuporteBloqueio,
} from '../../services/bloqueio';
import { Definicoes, guardarDefinicoes, MINUTOS_BLOQUEIO, MinutosBloqueio, useDefinicoes } from '../../services/definicoes';
import {
  estadoPermissao,
  EstadoPermissao,
  notificacoesDisponiveis,
  pedirPermissao,
  reagendarNotificacoes,
  testarNotificacao,
} from '../../services/notificacoes';
import { mudarTema } from '../../services/tema';
import { useAuth } from '../../contexts/AuthContext';
import { mostrarAlerta } from '../../utils/helpers';
import { confirmar } from '../../utils/confirmar';
import { eConfirmacaoValida } from '../../utils/apagarConta';
import { descreverProximo, Lembrete } from '../../utils/lembretes';
import { useT } from '../../i18n';
import { GRUPOS_MENU, type GrupoMenu } from '../../components/Separadores';
import { idDaRota, paginaVisivel, PAGINAS_SOLTAS, TITULO_GRUPO } from '../../utils/paginas';

// Definições deste telemóvel: lembretes (notificações locais) e bloqueio com a impressão digital.
// Ficam guardadas só no dispositivo (services/definicoes.ts). Na web nenhuma destas opções existe.

const TEXTO_TEMA: Record<PreferenciaTema, string> = { sistema: 'Sistema', claro: 'Claro', escuro: 'Escuro' };
const ICONE_TEMA: Record<PreferenciaTema, 'phone-portrait-outline' | 'sunny-outline' | 'moon-outline'> = {
  sistema: 'phone-portrait-outline',
  claro: 'sunny-outline',
  escuro: 'moon-outline',
};

const TEXTO_MINUTOS: Record<MinutosBloqueio, string> = { 0: 'Imediatamente', 1: '1 minuto', 5: '5 minutos' };

interface LinhaOpcaoProps {
  titulo: string;
  descricao?: string;
  valor: boolean;
  onMudar: (valor: boolean) => void;
  desativada?: boolean;
  ocupada?: boolean;
}

// Uma opção com interruptor: o texto todo também é tocável
function LinhaOpcao({ titulo, descricao, valor, onMudar, desativada, ocupada }: LinhaOpcaoProps) {
  const inativa = !!desativada || !!ocupada;
  return (
    <View style={[styles.linha, desativada && styles.linhaDesativada]}>
      <View style={styles.linhaTextos}>
        <Text style={styles.linhaTitulo}>{titulo}</Text>
        {descricao && <Text style={styles.linhaDescricao}>{descricao}</Text>}
      </View>
      <Switch
        value={valor}
        onValueChange={onMudar}
        disabled={inativa}
        accessibilityLabel={titulo}
        trackColor={{ false: cores.bordaForte, true: comAlfa(cores.primaria, 0.55) }}
        thumbColor={valor ? cores.primaria : cores.textoSecundario}
        ios_backgroundColor={cores.bordaForte}
      />
    </View>
  );
}

function Separador() {
  return <View style={styles.separador} />;
}

function Nota({ children, style }: { children: ReactNode; style?: any }) {
  return <Text style={[styles.nota, style]}>{children}</Text>;
}

export default function DefinicoesScreen() {
  const [menuVisible, setMenuVisible] = useState(false);
  const definicoes = useDefinicoes();
  const { apagarConta, logout } = useAuth();
  const t = useT();
  const [permissao, setPermissao] = useState<EstadoPermissao | null>(null);
  const [suporte, setSuporte] = useState<SuporteBloqueio | null>(null);
  const [lembretes, setLembretes] = useState<Lembrete[] | null | undefined>(undefined);
  const [ocupado, setOcupado] = useState(false);
  const [apagarVisivel, setApagarVisivel] = useState(false);
  const [textoApagar, setTextoApagar] = useState('');
  const [aApagar, setAApagar] = useState(false);

  const atualizarLembretes = useCallback(async () => {
    setLembretes(await reagendarNotificacoes());
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (notificacoesDisponiveis) {
        estadoPermissao().then(setPermissao);
        atualizarLembretes();
      }
      if (bloqueioDisponivel) verificarSuporte().then(setSuporte);
    }, [atualizarLembretes])
  );

  async function mudar(mudancas: Partial<Definicoes>, reagendar = true) {
    await guardarDefinicoes(mudancas);
    if (reagendar) await atualizarLembretes();
  }

  // ---- Páginas visíveis ----

  const ocultos = definicoes?.ocultos ?? [];
  const [paginasAbertas, setPaginasAbertas] = useState(false);

  async function alternarPagina(id: string, visivel: boolean) {
    const resto = ocultos.filter((o) => o !== id);
    await mudar({ ocultos: visivel ? resto : [...resto, id] }, false);
  }

  // ---- Lembretes ----

  // Com a explicação do que a app vai fazer, pede a autorização do sistema para mostrar notificações.
  // Devolve se ficou concedida (senão já explicou ao utilizador como a dar nas definições do Android)
  async function garantirPermissao(titulo: string, explicacao: string): Promise<boolean> {
    let estado = await estadoPermissao();
    if (estado === 'por-pedir') {
      const continuar = await confirmar(
        titulo,
        explicacao + '\n\n' + t('A seguir, o Android vai pedir autorização para mostrar notificações.'),
        t('Continuar')
      );
      if (!continuar) return false;
      // A janela da permissão põe a app em segundo plano: não é para bloquear por causa disso
      permitirSaidaTemporaria();
      try {
        estado = (await pedirPermissao()) ? 'concedida' : await estadoPermissao();
      } finally {
        terminarSaidaTemporaria();
      }
    }
    setPermissao(estado);
    if (estado !== 'concedida') {
      mostrarAlerta(
        t('Sem autorização para notificações'),
        t('Para receberes os lembretes, permite as notificações das Finanças nas definições do Android (Definições > Apps > Finanças > Notificações).')
      );
      return false;
    }
    return true;
  }

  async function ligarNotificacoes(ligar: boolean) {
    if (!ligar) {
      await mudar({ notificacoes: false });
      return;
    }
    setOcupado(true);
    try {
      const concedida = await garantirPermissao(
        t('Lembretes de pagamentos'),
        t('A app avisa-te na véspera (às 9h) de cada despesa fixa ainda por pagar e no dia do salário. Os lembretes são calculados neste telemóvel: nada é enviado para fora.')
      );
      if (concedida) await mudar({ notificacoes: true });
    } finally {
      setOcupado(false);
    }
  }

  // Avisos do servidor (push). Registar ou retirar este telemóvel faz-se sozinho (components/GestorLembretes)
  async function ligarAlertasServidor(ligar: boolean) {
    if (!ligar) {
      await mudar({ alertasServidor: false }, false);
      return;
    }
    setOcupado(true);
    try {
      const concedida = await garantirPermissao(
        t('Avisos do servidor'),
        t('O servidor das Finanças pode avisar-te de orçamentos perto do limite, pagamentos a vencer ou em atraso e objetivos atrasados. Para isso a app envia ao servidor um identificador deste telemóvel (não envia dados pessoais). Podes desligar quando quiseres.')
      );
      if (concedida) await mudar({ alertasServidor: true }, false);
    } finally {
      setOcupado(false);
    }
  }

  // ---- Apagar a conta ----

  function fecharApagar() {
    if (aApagar) return;
    setApagarVisivel(false);
    setTextoApagar('');
  }

  async function apagarTudo() {
    if (!eConfirmacaoValida(textoApagar) || aApagar) return;
    // Segunda confirmação: o que se escreveu no modal podia ter sido um toque sem querer
    const sim = await confirmar(
      t('Última confirmação'),
      t('Vais apagar para sempre todos os teus dados e a tua conta. Isto não se pode desfazer.'),
      'Apagar tudo'
    );
    if (!sim) return;

    setAApagar(true);
    let resultado;
    try {
      resultado = await apagarConta();
    } finally {
      setAApagar(false);
    }

    if (resultado.estado === 'erro-servidor') {
      // Nada foi apagado: o modal fica aberto para tentar outra vez
      mostrarAlerta(t('Erro'), `${resultado.mensagem}\n\n${t('Não foi apagado nada. Tenta outra vez.')}`);
      return;
    }

    setApagarVisivel(false);
    setTextoApagar('');
    if (resultado.estado === 'sessao-antiga') {
      const sair = await confirmar(
        t('Entra outra vez primeiro'),
        t('Por segurança, só se apaga a conta logo depois de entrar. Ainda não foi apagado nada: sai, entra outra vez com a tua password e repete "Apagar todos os dados e a conta".'),
        'Sair agora'
      );
      if (sair) {
        await logout();
        router.replace('/login' as Href);
      }
      return;
    }
    if (resultado.estado === 'acesso-por-apagar') {
      mostrarAlerta(
        t('Dados apagados'),
        (resultado.motivo === 'novo-login'
          ? t('Os teus dados foram apagados, mas o Firebase pediu um login mais recente para apagar o acesso.')
          : t('Os teus dados foram apagados, mas não foi possível apagar o acesso (email e password).')) +
          ' ' +
          t('Entra outra vez com a tua password e escolhe "Apagar todos os dados e a conta" para remover o acesso de vez.')
      );
    } else {
      mostrarAlerta(t('Conta apagada'), t('Os teus dados e a tua conta foram apagados. Obrigado por teres usado as Finanças.'));
    }
    router.replace('/login' as Href);
  }

  async function testar() {
    permitirSaidaTemporaria();
    let enviada = false;
    try {
      enviada = await testarNotificacao();
    } finally {
      terminarSaidaTemporaria();
    }
    setPermissao(await estadoPermissao());
    if (enviada) {
      mostrarAlerta(t('Notificação de teste'), t('Vais receber uma notificação daqui a 5 segundos. Podes sair da app para a ver.'));
    } else {
      mostrarAlerta(t('Sem autorização para notificações'), t('Permite as notificações das Finanças nas definições do Android.'));
    }
  }

  // ---- Bloqueio ----

  async function ligarBloqueio(ligar: boolean) {
    if (!ligar) {
      await mudar({ bloqueio: false }, false);
      return;
    }
    setOcupado(true);
    try {
      const atual = await verificarSuporte();
      setSuporte(atual);
      if (!atual.pode) {
        mostrarAlerta(t('Bloqueio indisponível'), atual.motivo);
        return;
      }
      // Confirmar já agora: se não funcionar neste telemóvel, não fica ligado
      const resultado = await autenticar(t('Confirmar o bloqueio da app'));
      if (!resultado.ok) {
        if (!resultado.cancelado) mostrarAlerta(t('Bloqueio não ligado'), resultado.mensagem);
        return;
      }
      await mudar({ bloqueio: true }, false);
    } finally {
      setOcupado(false);
    }
  }

  const semNada = !notificacoesDisponiveis && !bloqueioDisponivel;
  const notificacoesLigadas = !!definicoes?.notificacoes;
  const permissaoRetirada = notificacoesLigadas && permissao !== null && permissao !== 'concedida';

  return (
    <Ecra
      cabecalho={
        <>
          <Header title={t('Definições')} onMenuPress={() => setMenuVisible(true)} />
          <SideMenu visible={menuVisible} onClose={() => setMenuVisible(false)} />
        </>
      }
    >
      <Cartao>
        <TituloSecao titulo={t('Aparência')} icone="contrast-outline" />
        <View style={styles.chips}>
          {PREFERENCIAS_TEMA.map((p) => (
            <Chip
              key={p}
              rotulo={t(TEXTO_TEMA[p])}
              icone={ICONE_TEMA[p]}
              ativo={(definicoes?.tema ?? 'sistema') === p}
              onPress={() => mudarTema(p)}
              accessibilityLabel={t('Aparência: {opcao}', { opcao: t(TEXTO_TEMA[p]) })}
            />
          ))}
        </View>
        <Nota>{t('Sistema segue o modo claro ou escuro do telemóvel. Ao mudar, a app volta a abrir para aplicar as cores.')}</Nota>
      </Cartao>

      {semNada && (
        <Cartao>
          <TituloSecao titulo={t('Só na app do telemóvel')} icone="phone-portrait-outline" />
          <Text style={styles.texto}>
            {t('Os lembretes de pagamentos e o bloqueio com a impressão digital só existem na app Android. Instala a app no telemóvel para os usares.')}
          </Text>
        </Cartao>
      )}

      {notificacoesDisponiveis && (
        <Cartao>
          <TituloSecao titulo={t('Lembretes')} icone="notifications-outline" />
          <LinhaOpcao
            titulo={t('Lembrar pagamentos')}
            descricao={t('Na véspera de cada despesa fixa ainda por pagar, às 9h.')}
            valor={notificacoesLigadas}
            onMudar={ligarNotificacoes}
            ocupada={ocupado || !definicoes}
          />
          <Separador />
          <LinhaOpcao
            titulo={t('Também no próprio dia')}
            descricao={t('Outro aviso no dia do débito, às 9h.')}
            valor={!!definicoes?.lembrarNoDia}
            onMudar={(v) => mudar({ lembrarNoDia: v })}
            desativada={!notificacoesLigadas}
          />
          <Separador />
          <LinhaOpcao
            titulo={t('Avisos do servidor')}
            descricao={t('Orçamentos perto do limite, pagamentos a vencer ou em atraso e objetivos atrasados. Substituem os lembretes das despesas deste telemóvel.')}
            valor={!!definicoes?.alertasServidor && permissao === 'concedida'}
            onMudar={ligarAlertasServidor}
            ocupada={ocupado || !definicoes}
          />
          <Separador />
          <LinhaOpcao
            titulo={t('Dia de salário')}
            descricao={t('“Hoje é dia de salário”, às 9h do dia de recebimento.')}
            valor={!!definicoes?.lembrarSalario}
            onMudar={(v) => mudar({ lembrarSalario: v })}
            desativada={!notificacoesLigadas}
          />

          {permissaoRetirada ? (
            <View style={styles.aviso}>
              <Etiqueta
                texto={t('As notificações das Finanças estão desligadas nas definições do Android.')}
                cor={cores.aviso}
                icone="alert-circle-outline"
                style={styles.etiqueta}
              />
              <Botao titulo={t('Abrir definições do Android')} variante="secundario" pequeno icone="open-outline" onPress={() => Linking.openSettings()} />
            </View>
          ) : (
            notificacoesLigadas && (
              <Nota>
                {lembretes === undefined
                  ? t('A calcular os lembretes…')
                  : lembretes === null
                    ? t('Não foi possível atualizar os lembretes agora (sem ligação?). Ficam os que já estavam agendados.')
                    : descreverProximo(lembretes)}
              </Nota>
            )
          )}

          <Botao
            titulo={t('Testar notificação')}
            variante="secundario"
            icone="paper-plane-outline"
            onPress={testar}
            desativado={ocupado}
            style={styles.botao}
          />
        </Cartao>
      )}

      {bloqueioDisponivel && (
        <Cartao>
          <TituloSecao titulo={t('Segurança')} icone="finger-print" cor={cores.violetaTexto} />
          <LinhaOpcao
            titulo={t('Bloquear a app')}
            descricao={
              suporte?.pode === true && !suporte.biometria
                ? t('Pede o PIN, padrão ou palavra-passe do telemóvel ao abrir a app.')
                : t('Pede a impressão digital (ou o PIN do telemóvel) ao abrir a app.')
            }
            valor={!!definicoes?.bloqueio}
            onMudar={ligarBloqueio}
            ocupada={ocupado || !definicoes}
            desativada={suporte?.pode === false && !definicoes?.bloqueio}
          />
          {suporte?.pode === false && !definicoes?.bloqueio && (
            <Etiqueta texto={suporte.motivo} cor={cores.aviso} icone="alert-circle-outline" style={styles.etiquetaSolta} />
          )}

          {definicoes?.bloqueio && (
            <>
              <Separador />
              <Text style={styles.rotulo}>{t('Ao voltar à app, pedir de novo')}</Text>
              <View style={styles.chips}>
                {MINUTOS_BLOQUEIO.map((m) => (
                  <Chip
                    key={m}
                    rotulo={t(TEXTO_MINUTOS[m])}
                    ativo={definicoes.bloqueioMinutos === m}
                    cor={cores.violetaTexto}
                    onPress={() => mudar({ bloqueioMinutos: m }, false)}
                    accessibilityLabel={t('Pedir de novo: {minutos}', { minutos: t(TEXTO_MINUTOS[m]) })}
                  />
                ))}
              </View>
              <Nota>
                {definicoes.bloqueioMinutos === 0
                  ? t('Sempre que sais da app e voltas.')
                  : t('Quando estiveres fora da app pelo menos {tempo}.', {
                      tempo: t(TEXTO_MINUTOS[definicoes.bloqueioMinutos]),
                    })}{' '}
                {t('No ecrã de bloqueio podes sempre sair da conta e entrar com a password.')}
              </Nota>
            </>
          )}
        </Cartao>
      )}

      {/* Páginas visíveis: o que se esconde some do menu e dos separadores (os dados ficam guardados) */}
      <Cartao>
        <TituloSecao titulo={t('Páginas visíveis')} icone="eye-outline" />
        <Nota>{t('Escolhe o que queres ver no menu. Esconder uma página não apaga os dados.')}</Nota>
        <Botao
          titulo={ocultos.length > 0 ? t('Escolher páginas ({n} escondidas)', { n: ocultos.length }) : t('Escolher páginas')}
          variante="secundario"
          pequeno
          icone="options-outline"
          onPress={() => setPaginasAbertas(true)}
        />
      </Cartao>

      <ModalFormulario visivel={paginasAbertas} titulo={t('Páginas visíveis')} onFechar={() => setPaginasAbertas(false)}>
        {PAGINAS_SOLTAS.map((p) => (
          <LinhaOpcao
            key={p.id}
            titulo={t(p.rotulo)}
            valor={paginaVisivel(p.id, ocultos)}
            onMudar={(v) => alternarPagina(p.id, v)}
            ocupada={!definicoes}
          />
        ))}
        {(Object.keys(GRUPOS_MENU) as GrupoMenu[]).map((grupo) => (
          <View key={grupo}>
            <Separador />
            <Text style={styles.linhaTitulo}>{t(TITULO_GRUPO[grupo])}</Text>
            {GRUPOS_MENU[grupo].map((p) => (
              <LinhaOpcao
                key={p.rota}
                titulo={t(p.rotulo)}
                valor={paginaVisivel(idDaRota(p.rota), ocultos)}
                onMudar={(v) => alternarPagina(idDaRota(p.rota), v)}
                ocupada={!definicoes}
              />
            ))}
          </View>
        ))}
        <View style={styles.fecharPaginas}>
          <Botao titulo={t('Fechar')} onPress={() => setPaginasAbertas(false)} />
        </View>
      </ModalFormulario>

      <Cartao>
        <TituloSecao titulo={t('Regras de categorização')} icone="git-branch-outline" />
        <Nota>{t('Escolhe a categoria dos gastos pelo título (ex.: Continente → Supermercado). Também vale ao importar.')}</Nota>
        <Botao
          titulo={t('Ver regras')}
          variante="secundario"
          pequeno
          icone="git-branch-outline"
          onPress={() => router.push('/(tabs)/regras-categoria' as Href)}
        />
      </Cartao>

      <Cartao>
        <TituloSecao titulo={t('Alertas')} icone="notifications-outline" />
        <Nota>{t('O que pede atenção: orçamentos, pagamentos a vencer ou em atraso e objetivos atrasados.')}</Nota>
        <Botao
          titulo={t('Ver alertas')}
          variante="secundario"
          pequeno
          icone="notifications-outline"
          onPress={() => router.push('/(tabs)/alertas' as Href)}
        />
      </Cartao>

      <Cartao>
        <TituloSecao titulo={t('Histórico de alterações')} icone="time-outline" />
        <Nota>{t('O que foi criado, alterado ou apagado nos teus dados (no último ano).')}</Nota>
        <Botao
          titulo={t('Ver histórico')}
          variante="secundario"
          pequeno
          icone="list-outline"
          onPress={() => router.push('/(tabs)/historico' as Href)}
        />
      </Cartao>

      <Cartao>
        <TituloSecao titulo={t('Importar Excel')} icone="cloud-upload-outline" />
        <Nota>{t('Traz os teus dados de uma folha de Excel.')}</Nota>
        <Botao
          titulo={t('Importar')}
          variante="secundario"
          pequeno
          icone="cloud-upload-outline"
          onPress={() => router.push('/(tabs)/importar' as Href)}
        />
      </Cartao>

      <Cartao>
        <TituloSecao titulo={t('Importar extrato do banco')} icone="document-text-outline" />
        <Nota>{t('Traz os movimentos da tua conta (CSV ou OFX) como despesas, já com categoria.')}</Nota>
        <Botao
          titulo={t('Importar extrato')}
          variante="secundario"
          pequeno
          icone="document-text-outline"
          onPress={() => router.push('/(tabs)/extrato' as Href)}
        />
      </Cartao>

      {/* Zona de perigo: apaga TODOS os dados (API) e a conta (Firebase), com dupla confirmação */}
      <Cartao acento={cores.negativo}>
        <TituloSecao titulo={t('Zona de perigo')} icone="warning-outline" cor={cores.negativo} />
        <Nota style={styles.notaSemMargem}>{t('Apaga para sempre todos os teus dados e a tua conta. Não se pode desfazer.')}</Nota>
        <Botao
          titulo={t('Apagar todos os dados e a conta')}
          variante="perigo"
          icone="trash-outline"
          onPress={() => setApagarVisivel(true)}
          style={styles.botao}
        />
      </Cartao>

      <ApagarContaModal
        visivel={apagarVisivel}
        texto={textoApagar}
        onMudarTexto={setTextoApagar}
        aApagar={aApagar}
        onConfirmar={apagarTudo}
        onFechar={fecharApagar}
      />

      {Platform.OS !== 'web' && (
        <Nota>{t('Estas definições ficam só neste telemóvel.')}</Nota>
      )}
    </Ecra>
  );
}

const styles = StyleSheet.create({
  texto: {
    ...tipografia.secundario,
    lineHeight: 20,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    minHeight: 52,
    paddingVertical: espaco.xs,
  },
  linhaDesativada: {
    opacity: 0.45,
  },
  linhaTextos: {
    flex: 1,
  },
  linhaTitulo: {
    fontFamily: fontes.corpoMedio,
    fontSize: 15,
    color: cores.texto,
  },
  linhaDescricao: {
    ...tipografia.nota,
    marginTop: 2,
  },
  fecharPaginas: {
    marginTop: espaco.lg,
  },
  separador: {
    height: 1,
    backgroundColor: cores.borda,
    marginVertical: espaco.sm,
  },
  nota: {
    ...tipografia.nota,
    marginTop: espaco.md,
  },
  aviso: {
    marginTop: espaco.md,
    gap: espaco.sm,
  },
  etiqueta: {
    alignSelf: 'stretch',
  },
  etiquetaSolta: {
    alignSelf: 'stretch',
    marginTop: espaco.sm,
  },
  botao: {
    marginTop: espaco.lg,
  },
  notaSemMargem: {
    marginTop: 0,
  },
  rotulo: {
    ...tipografia.rotulo,
    marginBottom: espaco.sm,
  },
  parceriaLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espaco.xs,
  },
  parceriaTexto: {
    fontFamily: fontes.corpo,
    fontSize: 14,
    color: cores.texto,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
  },
});
