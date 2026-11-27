# Finanças — app (Expo / React Native)

Ecrãs para a web e para Android. O login é feito no Firebase Auth e os dados vêm da API
(`../backend`). Visão geral do projeto no [README da raiz](../README.md).

```bash
npm install
npx expo start      # desenvolvimento (web: tecla w)
npx tsc --noEmit    # tipos
npx jest            # testes unitários
npm run e2e         # testes E2E no browser (Playwright), ver abaixo
```

## O que muda com um APK novo e o que chega por atualização

| Mudança | Como chega à app |
|---|---|
| Só código JavaScript/TypeScript (ecrãs, textos, tema, API) | `npm run publicar:app` (EAS Update) ou `npm run deploy:web` |
| Código nativo: **Sentry**, atalhos do ícone, `userInterfaceStyle` do tema, novas permissões, **push (google-services.json / FCM)** | APK novo: `npx eas-cli build -p android --profile preview` |

Num APK antigo a app continua a abrir mesmo com as novidades por atualização: o Sentry fica desligado
(sem o módulo nativo) e o tema segue o que o Android deixar.

## Alertas, push do servidor e lembretes

- **Alertas** (`GET /api/alertas`): cartão no Início (os 3 mais graves), ecrã *Alertas* (menu, com emblema) e
  atalho nas Definições. Tocar num alerta abre o ecrã onde se resolve (orçamentos, despesas fixas, dívidas, objetivos).
- **Push do servidor** (Definições > Lembretes > *Avisos do servidor*, desligado por defeito): ao ligar, a app explica o
  que envia e pede a permissão do sistema; com ela, regista o token do Expo em `POST /api/dispositivos` (o `projectId`
  vem de `app.json` > `extra.eas.projectId`) sempre que a app abre e com a sessão iniciada. O token sai (`DELETE`) ao sair
  da conta, ao desligar a opção e ao apagar a conta. Na web não se regista nada. Tocar numa push abre o `url` dos dados.
- **Sem avisos duplicados**: com o telemóvel registado nas push, os lembretes locais das *despesas* (véspera e dia do
  débito) deixam de se agendar; o lembrete do *dia de salário* continua local (o servidor não o cobre). Sem registo
  (web, sem permissão, servidor em baixo) os lembretes locais funcionam como antes: são o plano B.
  (`services/push.ts` + `definirPushDoServidor` em `services/notificacoes.ts`.)
- **Android precisa de FCM**: para o token push funcionar num APK é preciso o `google-services.json` do projeto Firebase
  (`android.googleServicesFile` no `app.json`) e a chave FCM v1 carregada no EAS (`eas credentials`). Isto é nativo:
  exige um **APK novo**.

## Regras de categorização

Definições > *Regras de categorização*: listar, criar, editar, ativar/desativar e apagar as regras do utilizador, ver as
regras padrão (só de leitura, com *Copiar para as minhas*) e experimentar um título. No formulário de gastos a categoria
sugerida por uma regra mostra *Regra: <texto>*. A importação do Excel não manda categoria: quem aplica as regras é a API.

## Dívidas com taxa, simulador e extrato do credor

No ecrã **Dívidas**, o formulário tem um bloco opcional *Contrato* (TAN, valor financiado, entrada, prazo, mês da primeira
prestação, seguros por mês e comissão de reembolso). Com a **taxa** a dívida passa a ser um crédito: o valor que se
escreve é o **capital** em dívida e a app mostra a próxima prestação (capital, juros, selo e seguros), quando acaba, os
juros e o total que ainda vai sair (o grande número do cartão), o que já foi amortizado e o custo do contrato.
- **Simular amortização** (em cada crédito): amortizar X de uma vez *mantendo a prestação* (acaba mais cedo) ou
  *reduzindo a prestação*, pagar tudo agora e pagar mais por mês; mostra o que se poupa, já descontada a comissão.
- **Comparar estratégias** (com 2 ou mais dívidas): só as prestações, bola de neve e avalanche.
- **Importar extrato (PDF)**: escolhe o PDF do credor (testado com o Montepio Crédito e a Cofidis) e a app preenche o contrato, o
  capital em dívida e a próxima prestação (valor, vencimento, "6 de 60", em dia ou em atraso). O PDF é lido na API e não
  fica guardado; o nome, a morada, o NIF e o IBAN nem chegam à app. Importar o extrato do mês seguinte atualiza a mesma
  dívida (reconhece o número do contrato).

As contas são da API (`backend/src/Financas.Services/Regras/Amortizacao.cs`); a app só pede e mostra
(`services/dividas.ts`, `components/dividas/`).

## Importar o extrato do banco

Definições > *Importar extrato* (ecrã `extrato`): escolhe o extrato da conta em **CSV ou OFX**. O CSV é lido por
mapeamento de colunas (`services/extratoBancario.ts`): a app adivinha a data, a descrição e o valor (uma coluna com
sinal ou débito e crédito; separador `;` `,` tab, vírgula ou ponto nos decimais, UTF-8 ou Windows-1252, linhas antes
da tabela) e lembra as colunas para o mesmo formato. Só as **saídas** viram despesas, com a categoria sugerida pela API
(as tuas regras, o histórico, palavras-chave) que se pode mudar em cada uma. Os movimentos já importados ficam de fora
(importar o mesmo extrato duas vezes não duplica nada) e os que parecem repetir uma despesa que já registaste vêm
desmarcados. Fica no histórico: não mexe no saldo da app.

## Gastos fora do normal

Os alertas (sino e push) avisam quando uma categoria já gastou bem mais do que costuma nos últimos 3 meses, quando uma
despesa mensal subiu (ex.: a eletricidade) ou quando um gasto recente é muito maior que o habitual da categoria. As
regras e os limiares estão em `backend/README.md` (Alertas proativos).

## Apagar todos os dados e a conta

Definições > *Zona de perigo*: modal que explica o que se perde + escrever `APAGAR` + uma segunda confirmação. Passos:
`DELETE /api/conta` ({ confirmacao: "APAGAR" }), limpar o telemóvel (fila offline, preferências, lembretes, bloqueio),
apagar o utilizador no Firebase e voltar ao login. Se o último login for antigo, **nada** é apagado e pede-se para entrar
outra vez (evita ficar a meio); se mesmo assim o Firebase recusar depois de a API apagar, diz-se ao utilizador que os dados
já foram apagados e que deve entrar outra vez e repetir para remover o acesso.

## Monitorização de erros (Sentry)

Tudo está em `services/erros.ts`. Sem `EXPO_PUBLIC_SENTRY_DSN` fica **desligado** (não faz nada).

1. Cria um projeto "React Native" em [sentry.io](https://sentry.io) e copia o DSN
   (Settings > Client Keys). Não é secreto.
2. Põe-no em `frontend/.env` (`EXPO_PUBLIC_SENTRY_DSN=...`) e faz um build novo (APK e/ou `npm run deploy:web`).
3. Só envia em builds de produção (não em `__DEV__`).

O que vai para o Sentry: erros que rebentam um ecrã (`ErrorBoundary` em `app/_layout.tsx`) e falhas do
cliente da API (`services/api.ts`): erros 5xx, falta de rede e tempo esgotado, no máximo um aviso por
minuto para o mesmo problema. **Não vai** email, nome, IP, corpos dos pedidos nem textos ou valores das
despesas: o utilizador é só o `uid` do Firebase e os caminhos da API levam os ids trocados por `:id`
(`limparEvento` em `services/erros.ts`, testado em `__tests__/erros.test.ts`).

## "A acordar o servidor" (Render grátis)

A API adormece sem pedidos e o primeiro demora até ~1 minuto. O cliente da API (`services/api.ts`):

- mostra no cabeçalho `components/AvisoServidorAcordar.tsx` quando um pedido passa de 3 s, com contador;
- até a API responder pela primeira vez, repete os `GET` que falham (rede, tempo esgotado, 502/503/504)
  com espera crescente (2, 4, 8, 15 e 20 s). Os pedidos que escrevem (`POST`...) não se repetem: os gastos
  novos sem internet vão para a fila offline (`services/filaOffline.ts`);
- nunca bloqueia: os ecrãs abrem com o que têm e o aviso é só uma faixa.

O estado fica em `services/servidor.ts`.

## Aparência (Sistema / Claro / Escuro)

Definições > Aparência (e o botão de sol/lua no rodapé do menu lateral). As duas paletas estão em
`constants/paletas.ts`; `constants/tema.ts` escolhe uma ao arrancar. Como os estilos são criados uma
vez, **mudar de tema reinicia a app** (um segundo). Na web a escolha fica no `localStorage`; no
telemóvel aplica-se com `Appearance.setColorScheme` ao abrir. `app.json` passou a
`userInterfaceStyle: "automatic"` (precisa de APK novo; num APK antigo "Sistema" fica sempre escuro).
`__tests__/tema.test.ts` mede o contraste (WCAG AA, mínimo 4,5:1) dos pares de cores das duas paletas.

## Acessibilidade

- Componentes de `components/ui` e botões só-ícone têm `accessibilityRole`/`accessibilityLabel`
  (traduzidos em `i18n/textos`); os ícones são decorativos (escondidos do leitor de ecrã).
- A letra acompanha o tamanho do telemóvel até ao teto de 130% (`utils/acessibilidade.ts`).
- Áreas de toque de pelo menos 44 px (`layout.alvoToque` em `constants/tema.ts`).

## Atalho "Novo gasto" no ícone da app (Android)

Tocar sem largar no ícone da app mostra "Novo gasto", "Gastos do dia a dia" e "Resumo do mês"
(`expo-quick-actions`, plugin em `app.json`, lógica em `services/atalhos.ts`; "Novo gasto" abre a folha de
gasto rápido, `components/GestorGastoRapido.tsx`). Os ícones dos atalhos são código nativo: **só aparecem
com um APK novo**.

**Widget de ecrã inicial: não foi feito.** Um widget a sério (botão "+" no ecrã inicial do Android) exige
código nativo (um `AppWidgetProvider` em Kotlin e um config plugin do Expo que o registe no
`AndroidManifest`) e um build novo. Fica como trabalho futuro; o atalho do ícone cobre o caso mais comum.

## Testes E2E (Playwright, web)

Pasta `e2e/`: login, nova despesa extra, folha do mês e exportar Excel.

```bash
npm run e2e                        # arranca a API, o Expo web e corre tudo
npm run e2e:ui                     # com a interface do Playwright
```

- Primeira vez: `npx playwright install chromium` (ou usar o Chrome/Edge do computador:
  `E2E_BROWSER_CHANNEL=chrome npm run e2e`; no PowerShell `$env:E2E_BROWSER_CHANNEL='chrome'; npm run e2e`).
- Precisa do .NET 10 SDK (`dotnet run` da API) e de Node 22. O `playwright.config.ts` arranca:
  - a API em `http://localhost:5081` com SQLite novo em cada corrida (`e2e/iniciar-api.mjs`), em
    Development e com a autenticação pelo cabeçalho `X-Utilizador`
    (`backend/src/Financas.Api/Autenticacao/AutenticacaoPorCabecalho.cs`);
  - o Expo web em `http://localhost:8099` com `EXPO_PUBLIC_E2E=1`.
- `EXPO_PUBLIC_E2E=1` liga o **modo E2E** (`utils/e2e.ts`): a app não usa o Firebase, o login aceita só
  `e2e@exemplo.pt` / `e2e-password` e a API recebe `X-Utilizador`. Só funciona num servidor de
  desenvolvimento (`__DEV__`): numa versão publicada (`expo export`, EAS) o atalho nunca liga, mesmo que a
  variável fique definida por engano, e o servidor também ignora o cabeçalho fora de Development.
- Windows com "Controlo de Aplicações" (Smart App Control / WDAC) a bloquear DLLs .NET não assinadas: a API não arranca
  (`FileLoadException ... 0x800711C7`) e os testes falham à espera dela. O `iniciar-api.mjs` já usa
  `-p:UseAppHost=false` (evita o `.exe`), mas se a política bloquear as DLLs da própria API só ajuda correr noutra
  máquina ou no CI (Linux).
- Ainda não está no CI. Comando para o job: `cd frontend && npm ci && npx playwright install --with-deps chromium && npm run e2e`.
