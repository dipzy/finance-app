# Finanças — API (.NET)

API em ASP.NET Core (.NET 10) que guarda os dados da app e aplica as regras (saldos, salário,
débitos, poupanças, dívidas, folha do mês). A app (Expo / React Native, na pasta `frontend/`) só mostra
os ecrãs e fala com esta API por HTTP.

```
  App (web / Android)                          Render (grátis)                     Neon (grátis)
 ┌────────────────────┐  HTTPS + token  ┌──────────────────────────┐   EF Core   ┌──────────────┐
 │ login: Firebase    │ ──────────────► │ Financas.Api (Controllers)│ ──────────► │  PostgreSQL  │
 │ Auth               │  Authorization: │   ↓                       │             └──────────────┘
 │ dados: services/   │  Bearer <token> │ Financas.Services (regras)│
 │ database.ts → API  │ ◄────────────── │   ↓                       │
 └────────────────────┘      JSON       │ Financas.DAL (EF Core)    │
                                        └──────────────────────────┘
```

O login continua no **Firebase Auth**. A API não guarda passwords: valida o *ID token* que a app
envia em cada pedido (assinatura com as chaves públicas da Google, emissor
`https://securetoken.google.com/financas-app-2ffc6`, audiência `financas-app-2ffc6` e validade)
e usa o `user_id` do token para só mexer nos dados desse utilizador.

## As três camadas

```
backend/
  Financas.sln
  src/
    Financas.Api/        Controllers, Program.cs, autenticação, CORS, OpenAPI, erros
    Financas.Services/   Regras de negócio (serviços), DTOs, validação, Calculos
    Financas.DAL/        EF Core: DbContext, entidades, migrações, repositórios, UnitOfWork
  tests/
    Financas.Services.Tests/   regras e serviços (SQLite em memória; Postgres/ em PostgreSQL)
    Financas.Api.Tests/        pedidos HTTP a sério (WebApplicationFactory)
```

Cada camada só conhece a de baixo: **Api → Services → DAL**.

- **Financas.Api**: os controllers são "magros". Recebem o pedido (já validado pelo `[ApiController]`
  através dos atributos dos DTOs), chamam a interface do serviço e devolvem o resultado. Nunca veem
  o `DbContext` nem as entidades. O `Program.cs` é a *composition root*: junta as três camadas
  (`AddServices`, `AddDal`) e configura o HTTP. As exceções dos serviços viram `ProblemDetails`
  em português no `Erros/TratadorExcecoes.cs` (400 pedido inválido, 404 não existe, 409 conflito).
- **Financas.Services**: `IContaService`, `ISalarioService`, `IDespesasFixasService`,
  `IDespesasExtrasService`, `IPoupancasService`, `IDividasService`, `IFolhaMesService`,
  `IMesesService`, `IMigracaoService`, `IRelatorioPdfService`... (ver `Interfaces/IServicos.cs`). As regras puras estão em
  `Regras/Calculos.cs`, passadas do `services/calculos.ts` da app, com os mesmos testes. O "hoje"
  vem do `Relogio` (um `TimeProvider`) no fuso **Europe/Lisbon**: o servidor do Render está em UTC
  e, sem isto, o salário ou um débito podiam contar no dia errado perto da meia-noite.
- **Financas.DAL**: entidades (`Utilizador`, `DespesaFixa`, `PagamentoFixa`, `DespesaExtra`,
  `Poupanca`, `Divida`, `ResumoMes`, `GastoRecorrente`, `RegistoAlteracao`), configurações do EF Core (`Configuracoes/`), um repositório
  por tipo de dados (`Repositorios/`) e a `IUnitOfWork`.

### Um pedido do princípio ao fim

Adicionar uma despesa extra de 20 € com data de ontem:

```
POST /api/despesas-extras  { "titulo": "Jantar", "valor": 20, "data": "2026-10-01" }
  └► DespesasExtrasController.Adicionar(pedido)            (Api: valida o DTO, lê o uid do token)
       └► IDespesasExtrasService.AdicionarAsync(uid, pedido) (Services: a regra)
            └► IUnitOfWork.ExecuteInTransactionAsync(...)    (DAL: transação)
                 ├► IDespesasExtrasRepository.Adicionar(...)
                 └► IUtilizadoresRepository: saldo da conta − 20 €
            └► SaveChanges + COMMIT → PostgreSQL
  ◄── 201 Created  { "id": "..." }
```

### Dinheiro sem erros

- **Tudo ou nada:** as operações que mexem em dinheiro (receber o salário, pagar ou anular uma
  despesa mensal, adicionar, alterar ou apagar uma extra, transferir para uma poupança, importar
  uma folha) correm dentro de `ExecuteInTransactionAsync`.
- **Dois pedidos ao mesmo tempo** (por exemplo, telemóvel e PC) não se pisam, graças à
  **concorrência otimista**. As linhas com saldo (`Utilizador`, `Poupanca`) têm uma coluna
  `Versao`, que é um *concurrency token* (ver `Entidades/IVersionado.cs`). Se outro pedido mudou a
  linha entretanto, o `UPDATE ... WHERE Versao = @lida` não atualiza nada, a transação é desfeita e
  a operação repete-se com os dados novos, até 3 vezes. Isto funciona igual em PostgreSQL e em
  SQLite (testes).
- **A mesma despesa mensal não é paga duas vezes no mesmo mês:** há um índice único
  (utilizador, mês, despesa), e o id do pagamento é `"{mes}_{fixaId}"`, como na app.
- Os valores são `decimal(12,2)`, arredondados ao cêntimo.

## Endpoints (todos com token, exceto `/saude`, `/saude/pronta` e `/api/interno/...`)

| Área | Endpoints |
|---|---|
| Conta | `GET /api/conta/saldo` (faz o recebimento do salário e os débitos automáticos do dia e devolve o saldo), `GET /api/conta/saldos?mes=`, `PUT /api/conta/saldo`, `POST /api/conta/movimentos`, `GET/PUT /api/conta/cartao-alimentacao` (saldo do cartão de alimentação) |
| Salário | `GET/PUT /api/salario`, `POST /api/salario/receber` |
| Despesas mensais | `GET/POST /api/despesas-fixas`, `PATCH /{id}`, `POST /{id}/terminar`, `/{id}/debitar`, `/{id}/anular`, `/debitos-automaticos`, `GET /totais` |
| Pagamentos | `GET /api/pagamentos?mes=`, `PUT /api/pagamentos/{mes}/{fixaId}` |
| Despesas extras (Gastos do Dia a Dia) | `GET/POST /api/despesas-extras` (o POST aceita `Idempotency-Key`), `POST /historicas`, `PATCH/DELETE /{id}`, `GET /sugerir-categoria?titulo=`, `GET /pesquisa?texto=&categoria=&meioPagamento=&valorMin=&valorMax=&de=&ate=&pagina=&tamanho=` |
| Gastos recorrentes | `GET/POST /api/gastos-recorrentes`, `GET/PATCH/DELETE /{id}` (pausar/retomar: `PATCH` com `ativo`) |
| Registo de alterações | `GET /api/alteracoes?entidade=&de=&pagina=&tamanho=` |
| Orçamentos | `GET/POST /api/orcamentos`, `PATCH/DELETE /{id}`, `GET /estado?mes=` |
| Objetivos de poupança | `GET/POST /api/objetivos`, `GET/PATCH/DELETE /{id}` |
| Estatísticas | `GET /api/estatisticas/categorias?mes=`, `GET /api/estatisticas/evolucao?meses=12&ate=` |
| Análise | `GET /api/estatisticas/comparacao?mes=` (o mês contra o anterior), `GET /api/estatisticas/previsao` (o saldo no fim do mês atual), `GET /api/estatisticas/gastos-categorias?meses=6` (o que já se gastou por categoria); ver abaixo |
| Poupanças | `GET/POST /api/poupancas`, `PATCH/DELETE /{id}`, `POST /{id}/ajustar`, `PUT /{id}/saldo`, `POST /{id}/transferir`, `POST /{id}/contribuir[?mes=]` (contribuição manual do mês, ou de um mês em atraso), `GET /em-atraso` |
| Dívidas | `GET/POST /api/dividas`, `GET /estado`, `PATCH/DELETE /{id}`; com taxa (créditos): `POST /{id}/simulacao`, `POST /estrategias`, `POST /extrato/ler`, `POST /extrato/aplicar`; ver abaixo |
| Extrato bancário | `POST /api/despesas-extras/extrato/previsao` e `POST /api/despesas-extras/extrato` (importar CSV/OFX lido na app); ver abaixo |
| Folha do mês | `GET /api/folha/meses`, `GET /api/folha/{mes}`, `POST /api/folha/{mes}/importar` |
| Meses | `GET /api/meses/{mes}`, `PUT /{mes}/importado`, `POST /abertura` |
| Perfil e configurações | `GET/PUT /api/perfil`, `GET/PUT /api/configuracoes/financeiro`, `GET/PUT /api/configuracoes/ppr-poupanca` |
| Migração | `GET /api/migracao/estado`, `POST /api/migracao`, `POST /local`, `POST /preparar` |
| Relatórios | `GET /api/relatorios/mes/{mes}.pdf` (relatório do mês em PDF, ver abaixo) |
| Regras de categorização | `GET/POST /api/regras-categoria`, `PUT/DELETE /{id}`, `GET /sugerir?descricao=`, `GET /padrao`; ver abaixo |
| Alertas | `GET /api/alertas` (orçamentos, despesas e dívidas a vencer, objetivos atrasados, gastos fora do normal); ver abaixo |
| Dispositivos push | `GET/POST /api/dispositivos`, `DELETE /api/dispositivos?token=` (token do Expo) |
| Cron (interno) | `POST /api/interno/alertas/enviar` com `X-Cron-Secret`: envia os alertas por push; sem `Alertas__SegredoCron` está desativado (404) |
| Apagar a conta | `DELETE /api/conta` (ou `POST /api/conta/apagar`) com `{ "confirmacao": "APAGAR" }`; ver abaixo |
| Saúde | `GET /saude`: sem token e sem base de dados (Render e keep-alive); `GET /saude/pronta`: sem token, testa a base de dados (200 ou 503) |

O documento OpenAPI está em `/openapi/v1.json`. Em Development há também a interface do
**Scalar** em `/scalar`, para experimentar os pedidos.

### Categorias, orçamentos, objetivos e estatísticas

- **Categorias das despesas extras** (`Regras/Categorias.cs`): lista fixa de chaves estáveis
  (`supermercado`, `restauracao`, `transportes`, `combustivel`, `casa`, `saude`, `lazer`, `compras`,
  `educacao`, `viagens`, `presentes`, `outros`). A coluna é opcional: as despesas que já existiam
  ficam sem categoria e contam sempre como `outros`. **Sugestão pelo título**
  (`Categorias.Sugerir`, `GET /api/despesas-extras/sugerir-categoria`): (1) a categoria da despesa
  com o mesmo título (sem acentos nem maiúsculas) **registada mais recentemente**; (2) senão,
  palavras-chave (`continente` → supermercado, `uber eats` → restauração antes de `uber` →
  transportes; palavras curtas como `cp`/`bp` só contam inteiras); (3) senão `outros`. Uma
  despesa criada sem categoria (incluindo as históricas e as importadas do Excel) fica com a sugestão.
- **Orçamentos**: um limite mensal por categoria (índice único; repetir dá 409). O estado do mês
  (`Calculos.CalcularOrcamento`): `ok`, `perto` a partir de 80% e `ultrapassado` a partir de 100%
  do limite, comparando os valores exatos. **Ritmo** (`previsto`, só no mês atual): quanto se terá gasto no fim do
  mês ao ritmo de agora = despesas mensais já pagas na categoria + gasto do dia a dia ÷ dia de hoje × dias do mês
  (as mensais são pontuais: só se somam, não se esticam; `Regras/RitmoOrcamento.cs`). Com o orçamento ainda "ok"
  há um alerta `orcamento-ritmo` (ver Alertas) quando já passaram 5 dias, se gastou ≥ 50% do limite, o gasto vai
  ≥ 15 pontos percentuais à frente do mês e o previsto passa o limite.
- **Objetivos de poupança** (`Calculos.CalcularObjetivo`): valor alvo e mês alvo (`AAAA-MM`,
  inclusive). O valor atual é o saldo da poupança ligada ou um valor escrito à mão. Meses
  restantes = do mês atual ao mês alvo, os dois incluídos; valor por mês = em falta / meses
  restantes (ao cêntimo para cima). **Ritmo** (com poupança ligada e o objetivo por atingir): `contribuicaoMensal`
  (o que a poupança recebe por mês), `diferenca` (contribuição − valor por mês: negativo = falta isso por mês)
  e `mesPrevisto` (o mês em que se chega ao alvo a esse ritmo: em falta ÷ contribuição, para cima; `null` se a
  poupança não recebe nada ou se demora mais de 50 anos; os juros não entram). Sem poupança ligada não se sabe a que
  ritmo se junta, por isso não há ritmo (`RitmoObjetivos`, em `Regras/RitmoOrcamento.cs`). Estado: `atingido`; `atrasado` se o mês alvo já passou ou se tem
  menos do que o ritmo constante pedia desde o mês em que foi criado (o mês atual ainda não conta);
  senão `no-bom-caminho`. Apagar a poupança ligada deixa o objetivo com o saldo dela, à mão.
- **Evolução** (`GET /api/estatisticas/evolucao`): para cada mês, a folha desse mês
  (`IFolhaMesService.ObterVariosAsync`, que lê os dados uma vez e monta cada mês como
  `ObterDadosAsync`) e os totais de `Calculos.TotaisFolha` (porte de `totaisFolha` da app):
  entrou = Lucro (sem linhas informativas), gasto = Despesas + Despesas do Mês, poupado = Poupança,
  saldo final = o "Saldo Conta" da folha (no mês atual, o saldo de agora; `null` se não se souber),
  despesasMensais / despesasExtras = as duas partes do gasto, livre = Total da folha (nunca abaixo de 0).
  São exatamente os números do Resumo do mês, com as mesmas particularidades: o bloco Despesas
  inclui as despesas mensais ativas nesse mês mesmo que não tenham sido pagas (pelo valor atual) e
  não inclui as anuais (o bloco Anual é informativo).
- `IEstatisticasService`, `IOrcamentosService` e `IObjetivosService` são interfaces de Services,
  que o relatório mensal em PDF (abaixo) usa diretamente.

### Análise: comparação com o mês anterior e previsão do fim do mês

- **Comparação** (`GET /api/estatisticas/comparacao?mes=`, por defeito o mês atual; um mês futuro dá 400):
  para gastos do dia a dia, despesas fixas, poupado e entrou devolve `{ atual, anterior, diferenca, variacao }`
  e, para cada categoria de gastos com valor num dos dois meses, o mesmo com a `categoria`.
  `diferenca = atual − anterior`; `variacao = diferenca / anterior × 100` (uma casa decimal), `null` quando o
  anterior é 0 (a app mostra "novo"). As categorias vêm da maior para a menor diferença em valor absoluto
  (`Calculos.CompararCategorias`). Despesas fixas, poupado e entrou são os da folha de cada mês (como a
  evolução); os gastos do dia a dia são as despesas extras. **No mês atual compara-se o mesmo período:**
  os gastos do dia a dia do mês anterior contam só até ao dia de hoje (`ateDia`; ex.: 1-15 out. contra
  1-15 set.; as antigas sem data ficam de fora). Nos meses passados, `ateDia` é `null` e comparam-se meses
  completos. As despesas fixas comparam-se sempre pelo mês inteiro (são as do mês, pagas ou por pagar).
- **Gastos por categoria** (`GET /api/estatisticas/gastos-categorias?meses=6`, até 36): o que **já se gastou** no dia a dia
  (despesas extras), sem previsões, para o simulador "e se…" da app. Vem separado entre a `conta` e o `cartao` de
  alimentação (`null` sem cartão configurado no Salário; `cartaoMensal` é o que ele carrega por mês) e, em cada um,
  `mesAtual` (o mês atual até hoje) e `media` (a média **por mês** dos `mesesBase` meses completos anteriores, sem o atual,
  a contar do mês do gasto mais antigo; cada categoria divide pelo número de meses, mesmo que só tenha gasto em alguns).
  Sem nenhum mês completo, `mesesBase` é 0 e a `media` vem vazia.
- **Previsão** (`GET /api/estatisticas/previsao`, mês atual; como o `GET /api/conta/saldos`, primeiro recebe
  o salário, faz os débitos e gera os gastos recorrentes de hoje):
  ```
  previsaoFinal     = saldoAtual − porPagarFixas − poupancasPorEnviar − estimativaGastos
  estimativaGastos  = mediaDiaria × diasRestantes + gastosRecorrentes
  mediaDiaria       = gastos do dia a dia dos últimos 3 meses completos / dias desses meses
                      (menos meses se o gasto mais antigo for mais recente; sem nenhum: os deste mês até hoje / dia de hoje)
  diasRestantes     = de amanhã ao fim do mês (no último dia, 0)
  gastosRecorrentes = as repetições dos gastos recorrentes ativos pagos com a conta, de amanhã ao fim do mês
  ```
  Os gastos pagos com o cartão de alimentação não saem da conta e não contam. Os gerados pelos gastos
  recorrentes ativos também ficam fora da média (entram explicitamente pelas repetições que faltam); os de
  recorrentes em pausa ou apagados contam na média. `categorias` reparte a estimativa por categoria (média da categoria × dias que faltam + os recorrentes dela; é o que o
  simulador "e se…" da app usa para saber quanto se pode cortar em cada uma). `categoriasMes` é o mesmo para um mês inteiro
  (média da categoria × dias do mês + os recorrentes do mês todo): a base do simulador "o que recebo por mês".
  `cartao` é a previsão do **cartão de alimentação**, à parte da conta (os gastos pagos com ele não entram em nada do
  resto): `previsaoFinal = saldo + cargaPorReceber − estimativaGastos` (a carga é o valor do cartão do Salário se o dia do
  salário ainda não chegou e o deste mês ainda não entrou; os gastos são a média por dia dos mesmos meses, só com os gastos
  pagos com o cartão, mais as repetições que faltam dos recorrentes pagos com ele) e `falta` é o que passa do saldo: o cartão
  não fica negativo, por isso sairia da conta. **Sem cartão configurado no Salário, `cartao` não vem** (e a app esconde tudo o
  que é do cartão). `base` diz de onde vem a média ("3 meses", "2 meses",
  "1 mês" ou "este mês"). As regras puras estão em `Calculos.EstimarGastosAteFimDoMes` (testes com datas
  fixas, incluindo fins de mês e anos bissextos, em `AnaliseTests.cs`).
- **Poupanças com contribuição manual** (`contribuicaoAutomatica: false`): a contribuição do mês só sai da
  conta quando se carrega em "Já enviei" (`POST /api/poupancas/{id}/contribuir`), que guarda
  `ultimaContribuicaoMes` e o dia (`ultimaContribuicaoEm`, para a app mostrar "Enviada dd/mm"; também nas
  automáticas). Cada poupança tem **`contarNoPrevisto`** (por defeito `true`): enquanto a contribuição deste
  mês não for enviada, o valor (`valorMensal` na lista, as percentagens do salário de agora) sai do Saldo
  Previsto (`GET /api/conta/saldos`: `previsto = disponível − porPagar − poupancasPorEnviar`) e da previsão
  do fim do mês. Com `false` é ignorada. Só no mês atual (`Calculos.PoupancasPorEnviar`).
  - **Meses esquecidos:** cada contribuição manual fica registada por poupança e mês (tabela
    `ContribuicoesPoupanca`, chave `(utilizador, poupança, mês)`: nunca se envia duas vezes o mesmo mês).
    `GET /api/poupancas/em-atraso` devolve as dos **últimos 3 meses** (sem o atual) que ficaram por enviar, com o
    valor de hoje, e `POST /api/poupancas/{id}/contribuir?mes=AAAA-MM` regulariza uma: sai da conta agora e fica
    registada nesse mês (não mexe em `ultimaContribuicaoMes`, que é a deste mês). Só conta a partir de
    `Poupanca.Inicio` (o mês da criação, ou em que passou a manual); fora dos 3 meses, antes do início ou no
    futuro dá 400. As regras puras estão em `RegrasPoupancas`; os meses não entram nos totais do mês atual nem no
    previsto. A migração `ContribuicoesPoupanca` põe `Inicio` = último mês enviado (ou o mês da migração) e
    regista esse último mês, para as poupanças que já existiam não mostrarem meses antigos.

### Relatório mensal em PDF

`GET /api/relatorios/mes/{mes}.pdf` (ex.: `/api/relatorios/mes/2026-10.pdf`) devolve
`application/pdf` com o nome `financas-AAAA-MM.pdf`. Com token, só com os dados de quem pede; um mês
inválido ou futuro dá 400. Na app: botão **Exportar PDF** no Resumo do mês (o mês escolhido).

- **`IRelatorioPdfService`** (`RelatorioPdfService.cs`) não tem regras próprias: junta a folha do mês
  (`IFolhaMesService`), a evolução e os gastos por categoria (`IEstatisticasService`), o estado dos
  orçamentos, os objetivos, as poupanças, as dívidas em falta, o cartão de alimentação e o nome do
  perfil num `DadosRelatorioMes`. Só lê: não recebe o salário nem faz débitos. Os números do mês são
  os da evolução (`Calculos.TotaisFolha`), os mesmos do Resumo do mês.
- **O documento** (`Relatorios/DocumentoRelatorioMes.cs`, A4, fundo branco para imprimir, acentos
  ciano `#00B8D4` e violeta `#7C5CFF`): cabeçalho "Finanças — Mês Ano" com o nome e a data;
  os números (Entrou, Despesas mensais, Despesas extras, Poupado, Livre; Saldo da conta, Previsão no
  fim do mês só no mês atual, Cartão de alimentação); gráficos desenhados em SVG no C#
  (`Relatorios/GraficosSvg.cs`: anel da distribuição, barras da evolução de 12 meses) e barras por
  categoria; tabelas de despesas mensais (dia, valor, Pago dd/mm / Por pagar), despesas extras (data,
  categoria, Conta/Cartão), orçamentos, objetivos, poupanças e dívidas; rodapé com "Página x de y".
  As tabelas longas continuam na página seguinte com o cabeçalho repetido.
- **QuestPDF** (pacote NuGet em Financas.Services). A licença **Community** é gratuita para uso
  pessoal e para empresas com menos de 1 milhão de dólares de receita anual (e para projetos open
  source); acima disso precisa de licença paga (https://www.questpdf.com/license/). Esta app é de
  uso pessoal. A licença e as letras configuram-se uma vez no arranque
  (`ConfiguracaoPdf.Configurar()`, no `Program.cs`).
- **Letra:** a **Inter** (a mesma da app, licença SIL OFL em `Fontes/OFL.txt`) vai em
  `src/Financas.Services/Relatorios/Fontes/` e é copiada para a pasta `Fontes/` ao lado das DLLs no
  build e no `dotnet publish` (por isso também entra na imagem Docker, sem mudar o `Dockerfile`).
  O `QuestPDF.Settings.UseSystemFonts = false` faz o QuestPDF usar só estas letras: o PDF sai igual
  no Windows e no Linux do Render, que não tem fontes instaladas.
- **Testes:** `RelatorioPdfTests` (dados vindos dos outros serviços, PDF válido: começa por `%PDF-`,
  tamanho, número de páginas) e `RelatoriosApiTests` (200 + `application/pdf`, 401 sem token, 400
  para meses inválidos ou futuros, cada utilizador só com os seus dados). Para ver o aspeto com dados
  inventados: `FINANCAS_RELATORIO_EXEMPLO=C:\caminho\exemplo.pdf dotnet test --filter Documento_com_dados_inventados`.

### Cartão de alimentação

- O utilizador tem um **saldo do cartão** à parte (`Utilizador.SaldoCartaoAlimentacao`, na mesma
  linha e com a mesma `Versao` que o saldo da conta). No dia do salário, na mesma transação e uma
  vez por mês, carrega o valor do cartão configurado no Salário; o valor fica no recebimento do mês
  (`Recebimento.CartaoAlimentacao`). Acerta-se com `PUT /api/conta/cartao-alimentacao`.
- Cada despesa extra tem `meioPagamento`: `conta` (por defeito; todas as que já existiam) ou
  `cartaoAlimentacao`. Paga com o cartão, sai do saldo do cartão e **não** do Saldo Disponível.
  Editar o valor ou mudar o meio devolve o valor antigo para onde saiu e cobra o novo; apagar
  devolve. As históricas e importadas não mexem em saldos.
- O cartão **não fica negativo**: se não chegar, a API responde 409 com a mensagem a mostrar (a
  conta, essa, pode ficar negativa como sempre). Não bloqueia importações, que não mexem em saldos.
- Na folha do mês, as extras pagas com o cartão vêm marcadas com `cartaoAlimentacao: true`, mas **não
  contam** nos totais do mês (Despesas do Mês, `gasto` da evolução, Total): o dinheiro do cartão é à parte.
  Também não mexem no Saldo Disponível nem no Previsto, que só dependem da conta e das despesas mensais.
- Nas Despesas (mensais) da folha, cada linha traz `estado` (`pago` com a data do pagamento,
  ou `por-pagar` só no mês atual); nos meses passados sem registo não há estado. Não há "anulado":
  desfazer um pagamento (`POST /api/despesas-fixas/{id}/anular`) devolve o valor, apaga o registo e
  marca a despesa (`NaoDebitarAutomaticamenteEm`) para o débito automático não a pagar outra vez nesse mês.

### Gastos recorrentes

Um gasto do dia a dia que se repete (o café todos os dias, o combustível todas as semanas, o ginásio
todos os meses). A regra (`GastoRecorrente`: título, valor, categoria, conta/cartão, `frequencia`
`diaria`/`semanal`/`mensal`, `diaSemana` 1 = segunda ... 7 = domingo, `diaMes` 1-31, início, fim
opcional, ativo) gera **despesas extras normais** nos dias certos.

- **Geração preguiçosa**, como o salário e os débitos automáticos: corre no `GET /api/conta/saldo`
  (`IGastosRecorrentesService.GerarEmFaltaAsync`, no fim de `CalcularSaldoDisponivelAsync`). Gera os
  dias desde a `ultimaGeracao` (ou o início) até hoje em Lisboa (`Relogio`), numa transação. Os dias
  vêm de `Regras/Recorrencia.cs` (funções puras): o mensal no dia 31 conta o último dia nos meses mais
  curtos. Criar a regra gera logo as repetições até hoje (incluindo a de hoje).
- **Nunca em duplicado:** cada despesa gerada guarda `GastoRecorrenteId` + `DataOcorrencia`, com índice
  único; a geração mexe no saldo do utilizador (`Versao`), por isso dois dispositivos ao mesmo tempo dão
  conflito e a repetição da `UnitOfWork` já vê o que o primeiro gerou.
- **Limite:** no máximo 62 repetições de uma vez por regra (as mais recentes); com a app fechada muito
  tempo, as mais antigas não são geradas.
- **Cartão de alimentação sem saldo:** essa repetição é paga com a conta (fica com
  `meioPagamento: conta`, à vista na lista) e fica um aviso no log. O gasto não se perde e o cartão
  nunca fica negativo.
- **Pausa** (`PATCH {"ativo": false}`): não gera; ao retomar, os dias da pausa não são gerados (só o de
  hoje). Mudar o valor só conta daí para a frente. Apagar a regra deixa as despesas já geradas.

### Pesquisa

`GET /api/despesas-extras/pesquisa`: em todos os meses, com todos os filtros opcionais. A base de dados
filtra pelo utilizador e pelas datas (`de`/`ate`, inclusive); o resto é feito **em memória**: texto no
título sem acentos nem maiúsculas (`Formatos.NormalizarTitulo`, o mesmo da sugestão de categoria),
categoria (as sem categoria contam como `outros`), meio de pagamento e valores. Cada utilizador tem
poucas despesas e assim o texto compara-se igual em PostgreSQL e em SQLite, sem `unaccent` nem
*collations*. Resposta `{ total, soma, pagina, tamanho, itens }` (total e soma de todos os resultados,
itens da página), da mais recente para a mais antiga; `tamanho` até 200.

### Idempotency-Key (fila offline da app)

O `POST /api/despesas-extras` aceita o cabeçalho `Idempotency-Key` (um UUID da app, até 64 caracteres).
A chave fica na despesa (`ChaveIdempotencia`, índice único por utilizador; as despesas sem chave não
colidem, porque os NULL não contam como repetidos). Se a chave já existe, a API **não cria nem cobra
outra vez**: responde **200** com o id da primeira (a primeira vez é **201**). Dois pedidos com a mesma
chave ao mesmo tempo: o segundo choca no índice único (ou na `Versao` do utilizador), a `UnitOfWork`
trata isso como conflito e repete a operação, que já encontra a despesa.

### Registo de alterações (auditoria)

Cada criação, alteração ou remoção dos dados do utilizador (despesas fixas e extras, pagamentos,
poupanças, dívidas, orçamentos, objetivos, gastos recorrentes, regras de categorização e, nos grupos,
membros, despesas partilhadas, acertos, mealheiros, movimentos e contribuições) fica numa linha de `RegistosAlteracao`:
`Entidade`, `EntidadeId`, `Descricao` (o título nesse momento), `Acao` (`Criada`/`Alterada`/`Apagada`),
`Quando` (UTC), `Alteracoes` (JSON `{"Valor":{"de":20,"para":25}}`, só os campos que mudaram) e `Origem`
(`"PATCH /api/despesas-extras/abc"` ou `"sistema"`).

- **Como funciona:** um `SaveChangesInterceptor` do EF Core (`DAL/Auditoria/InterceptorAuditoria.cs`),
  ligado uma vez no `AddDbContext` (`opcoes.AddInterceptors(...)`). Antes de cada `SaveChanges`, percorre
  o `ChangeTracker` e junta as linhas de registo **ao mesmo SaveChanges**: ficam na mesma transação que
  a alteração. Nenhum serviço nem repositório sabe que isto existe.
- **Quais:** as entidades que implementam `IAuditavel` (de quem são, id e descrição). Os campos técnicos
  (`Versao`, `UltimaGeracao`, `CriadoEm`, a chave de idempotência) não contam: uma alteração só com eles
  não fica registada. O `Utilizador` (o saldo muda em quase todas as operações) e os resumos dos meses
  não são registados.
- **Grupos:** cada linha fica no histórico de quem a faz: o grupo e os acertos em nome de quem os criou, a
  despesa partilhada de quem pagou, a entrada/papel/saída do membro no do próprio membro, os movimentos e
  as contribuições dos mealheiros no de quem os fez. O mealheiro em si (nome, objetivo, saldo) não tem
  dono: fica em nome de quem faz o pedido (`IOrigemPedido.Utilizador`, o uid do token). As partes de cada
  participante (`ParteDespesaPartilhada`) não têm linha própria: a despesa partilhada já diz o que mudou.
  Apagar a conta não escreve registo (`ContextoAuditoria.SemRegisto()`) e apaga o do utilizador.
- **Repetições por conflito:** a tentativa falhada é desfeita e o `ChangeTracker.Clear()` da `UnitOfWork`
  esquece as linhas que ela juntou; fica um registo por alteração (há um teste).
- **A DAL não conhece o HTTP:** a origem vem de `IOrigemPedido` (interface na DAL, implementada na Api com
  o `IHttpContextAccessor`). O `ContextoAuditoria` usa-a e tem `using (contexto.ComoSistema())` para o que
  a app faz sozinha (a geração dos gastos recorrentes). Sem pedido HTTP (testes), a origem é "sistema".
- **Retenção:** um ano. As linhas mais antigas são apagadas (`ExecuteDelete`) quando o utilizador abre o
  histórico, em vez de uma tarefa agendada (o plano grátis do Render adormece).
- `Quando` é `DateTime` em UTC (e não `DateTimeOffset`) para se poder ordenar e filtrar na base de dados
  também em SQLite.

### Logs (Serilog)

- `Serilog.AspNetCore`, configurado pela secção `Serilog` do `appsettings.json`
  (`Registos/RegistosPedidos.cs`): consola (o Render mostra o stdout), **Information** em produção e
  **Debug** em Development (`appsettings.Development.json`); ASP.NET Core e EF Core só a partir de Warning.
- `UseSerilogRequestLogging`: uma linha por pedido (`HTTP GET /api/conta/saldo respondeu 200 em 35 ms`),
  Error nos 5xx, Debug no `/saude`. Todas as linhas levam `pedido=` (o id do pedido) e `utilizador=` (os
  primeiros 12 caracteres do SHA-256 do uid: dá para seguir uma pessoa sem expor o uid).
- **Nunca** vão para os logs: o token, a *connection string* e os corpos dos pedidos (valores). O caminho
  é registado sem a *query string*.

### Limites de pedidos (rate limiting)

- O middleware do ASP.NET Core (`AddRateLimiter`/`UseRateLimiter`, `Limites/LimitesPedidos.cs`), depois da
  autenticação: janela fixa de 1 minuto **por utilizador** (o uid; sem sessão, o IP).
- **120 pedidos/minuto** em geral e **10/minuto** nos pesados (`[EnableRateLimiting("pesados")]`: PDF,
  importação da folha e migração). Configurável em `LimitesPedidos:PorMinuto` e `PesadosPorMinuto`.
- A mais: **429** com ProblemDetails em português ("Demasiados pedidos") e `Retry-After`. O `/saude` nunca
  é limitado. **Os contadores vivem na memória do processo: o limite só vale para uma instância** (o plano
  grátis do Render tem uma). Com várias instâncias, cada uma contava à parte e o limite real seria
  multiplicado; seria preciso um contador partilhado (ex.: Redis).

### Dívidas com taxa: contrato, simulador e extrato do credor

Uma dívida sem taxa é só "quanto falta pagar" (como sempre). Com `taxaAnual` (TAN, em %) é um **crédito**: o valor
guardado (`valorInicial` a partir de `desde`) é o **capital** em dívida e cada prestação paga amortiza só o que sobra
depois dos juros do mês (capital × TAN / 12), do imposto do selo (4% dos juros) e dos seguros
(`encargosMensais`). Campos opcionais do contrato: `valorFinanciado`, `entrada`, `prazoMeses`, `inicioContrato`,
`comissaoReembolso` (% do capital amortizado), `numeroContrato` e `credor` (`PATCH` com `limpar` apaga-os). `GET
/estado` acrescenta `resumo` (prestação de capital + juros, juros da próxima prestação, quando acaba, juros e total
que faltam, preço total, capital já amortizado, juros e custo total do contrato) e `extrato` (do último extrato). As
contas são de `Regras/Amortizacao.cs` (prestação constante, arredondada ao cêntimo mês a mês).

- `POST /api/dividas/{id}/simulacao` `{ amortizacao?, extraMensal? }` (não grava): a situação atual, **pagar
  tudo agora**, e, se pedidos, amortizar X **mantendo a prestação** (acaba mais cedo) ou **reduzindo a prestação**
  (acaba no mesmo mês) e pagar mais por mês. Cada cenário traz a prestação, o fim, os juros, a comissão, o
  total a pagar e o que se poupa (juros, selo e seguros menos a comissão). Precisa de taxa e de prestação ligada (ou
  de um extrato importado).
- `POST /api/dividas/estrategias` `{ extraMensal }` (não grava): pagar só as prestações, **bola de neve** (a
  dívida mais pequena primeiro) ou **avalanche** (a taxa mais alta primeiro), para as dívidas com prestação.
- `POST /api/dividas/extrato/ler` `{ pdfBase64 }`: lê o PDF do extrato de um crédito (testado com o Montepio
  Crédito e com a Cofidis, que não tem nº de contrato e é identificada pelo "Nº DOSSIER";
  `Extratos/ExtratoCredito.cs`, com PdfPig: as palavras agrupam-se pela posição na página). Devolve só
  o contrato e a próxima prestação (**nunca** o nome, a morada, o NIF ou o IBAN) e a dívida com o mesmo
  `numeroContrato`. O PDF não fica guardado nem nada é gravado. `POST /api/dividas/extrato/aplicar` atualiza essa
  dívida (ou cria uma) com capital, taxa, prazo, seguros e a próxima prestação.
- O "total a pagar" de um crédito (cartão, folha do mês, relatório) é tudo o que ainda vai sair: capital + juros
  + selo + seguros.

### Importar o extrato bancário (CSV/OFX)

A app lê o ficheiro (`services/extratoBancario.ts`: separador, decimais, linhas antes da tabela, débito e crédito
ou valor com sinal, OFX) e envia as **saídas**. `POST /api/despesas-extras/extrato/previsao` devolve, por
movimento, a categoria sugerida (regras do utilizador, histórico, palavras-chave), se já foi importado e se parece
repetir uma despesa feita à mão (mesma data e valor). `POST /api/despesas-extras/extrato` cria as despesas **no
histórico**: não mexe no saldo da conta nem no do cartão. Cada movimento leva uma chave (`ext:` + SHA-256 de data,
valor, descrição e qual dos iguais, `ocorrencia`) na `Idempotency-Key` da despesa: importar o mesmo extrato duas
vezes, ou dois que se sobrepõem, não duplica nada. No máximo 1000 movimentos por pedido (a app parte os maiores).

### Regras de categorização automática

- `RegraCategoria` (por utilizador): `texto` (a descrição **contém** o texto, sem maiúsculas nem acentos),
  `categoria`, `ativa` (por defeito `true`) e `prioridade` (por defeito 0; **maior ganha**; em empate, o texto
  mais comprido e depois a mais antiga). Repetir o texto (sem maiúsculas nem acentos) dá 409.
- Ordem de escolha da categoria (`Categorias.Sugerir`, usada por `GET /api/despesas-extras/sugerir-categoria`,
  `GET /api/regras-categoria/sugerir?descricao=`, despesas extras e históricas, gastos recorrentes, despesas
  partilhadas e importação da folha, sempre que não vem categoria explícita):
  1. regras ativas do utilizador (`origem: "regra"`);
  2. a categoria usada da última vez no mesmo título (`"historico"`);
  3. palavras-chave (`"palavra-chave"`, como antes);
  4. regras padrão para Portugal (`"regra-padrao"`, `Regras/RegrasPadrao.cs`: Continente, Pingo Doce, Lidl,
     Aldi, Auchan, Mercadona, Minipreço, Intermarché, Recheio → supermercado; Galp, Repsol, BP, Prio →
     combustível; etc.), por **palavras inteiras** ("bp" não serve para "BPI"); `GET /padrao` lista-as;
  5. `outros` (`"por-defeito"`).
- A resposta de sugestão é `{ categoria, origem, regra? }` (`regra` = o texto da regra que serviu).

### Apagar a conta e os dados (RGPD)

`DELETE /api/conta` com `{ "confirmacao": "APAGAR" }` (exato; senão 400 e nada é apagado; também em
`POST /api/conta/apagar`). Responde 204. Numa só transação apaga tudo o que é do utilizador: despesas fixas e
extras, pagamentos, gastos recorrentes, poupanças, dívidas, meses, orçamentos, objetivos, regras,
dispositivos push, alertas enviados, contribuições para mealheiros, parcerias antigas, convites (enviados por
ele ou para o email do perfil / do token) e o registo de alterações, e por fim o utilizador.

- **Grupos onde ficava sozinho** (os outros já saíram): o grupo desaparece todo.
- **Grupos com mais gente:** o grupo e os dados dos outros ficam. Se era o único admin, o membro ativo mais
  antigo passa a admin. O que as contas do grupo guardam em nome dele (quem criou o grupo, despesas que
  pagou, partes, acertos, movimentos dos mealheiros) passa a um identificador anónimo `removido-...`, para
  os saldos dos outros continuarem certos e nada ficar ligado a ele; a linha dele no grupo fica como "saiu".
  O dinheiro que pôs nos mealheiros fica nos mealheiros.
- **Não apaga o utilizador no Firebase:** é a app que o faz depois de receber o 204.

### Alertas proativos e push

- `GET /api/alertas` → `[{ tipo, severidade, titulo, mensagem, referencia, data }]`, os mais graves primeiro.
  `tipo`: `orcamento-aviso` (≥ 80%), `orcamento-excedido` (≥ 100%), `orcamento-ritmo` (abaixo dos 80% mas a gastar-se depressa: ver
  o ritmo nos orçamentos; uma vez por mês), `despesa-a-vencer` (por pagar, dia de
  débito daqui a 0-3 dias), `despesa-vencida` (por pagar, dia passou), `divida-a-vencer` / `divida-vencida`
  (a prestação da dívida, nas mesmas condições; a despesa de uma dívida só aparece como dívida),
  `objetivo-atrasado`, e os **gastos fora do normal**, sempre em comparação com os últimos 3 meses
  (`Regras/GastosAnormais.cs`, conservadores de propósito): `categoria-acima-da-media` (o gasto do mês até hoje
  já passa em ≥ 40% e ≥ 15 € a média dos meses anteriores com gasto; precisa de 2 meses de histórico; no máximo
  3 por vez), `despesa-fixa-subiu` (o que se pagou este mês passa em ≥ 30% e ≥ 5 € a média dos 3 pagamentos
  anteriores; ex.: a eletricidade) e `gasto-incomum` (um gasto dos últimos 3 dias ≥ 3× o gasto típico da
  categoria e ≥ 50 €; precisa de 5 gastos no histórico; os gastos recorrentes não contam). Estes alertas são
  `aviso` e contam uma vez por mês (o isolado, uma vez). `severidade`: `info` | `aviso` | `critico`. `referencia` = id do orçamento / despesa /
  dívida / objetivo; `data` = o dia de débito (despesas e dívidas) ou hoje. Textos na língua do
  `Accept-Language`. Só lê: não recebe o salário nem faz débitos.
- `POST /api/dispositivos` `{ token, plataforma: android|ios|web, idioma?: pt|en }` → `{ id, plataforma, idioma }`
  (idempotente; o token do Expo só existe uma vez e passa para a última conta que o registar; no máximo 10
  por utilizador). `DELETE /api/dispositivos?token=...` → 204.
- **Envio:** `POST /api/interno/alertas/enviar` (sem token de utilizador, só o cabeçalho `X-Cron-Secret`).
  Sem `Alertas__SegredoCron` → 404 (desativado); cabeçalho em falta ou errado → 401; certo → 200
  `{ utilizadores, dispositivos, alertasEnviados, alertasJaEnviados, falhas, dispositivosRemovidos }`.
  Para cada utilizador com dispositivos envia pelo Expo (`IExpoPushClient`, `Push/NotificacoesPush.cs`) os
  alertas que ainda não enviou, na língua do dispositivo, com `data: { tipo, referencia, url }` (`url` = o ecrã
  da app) e `channelId: "pagamentos"`. **Nunca repete:** cada envio fica em `AlertasEnviados` (utilizador +
  chave do alerta). A chave inclui o período: avisos de orçamento, despesas/prestações a vencer e objetivos
  contam **uma vez por mês**; as vencidas repetem **uma vez por dia** enquanto não forem pagas. Um erro
  passageiro do Expo não regista o envio (tenta-se na vez seguinte); um token `DeviceNotRegistered` apaga o
  dispositivo. Os registos com mais de 90 dias são apagados.
- Chamado por um cron do GitHub Actions (o plano grátis do Render adormece, não há tarefas em segundo plano):
  `curl -fsS -X POST -H "X-Cron-Secret: $SEGREDO" https://<api>/api/interno/alertas/enviar`.

### Saúde

- `GET /saude`: o processo está vivo; **não toca na base de dados** (Render e keep-alive).
- `GET /saude/pronta` (readiness): faz um `SELECT 1` (até 5 s). 200 `{ estado: "pronta", baseDeDados: "ok" }`
  ou 503 `{ estado: "indisponivel", baseDeDados: "falha" }`. Sem token e nunca limitado, como o `/saude`.

### Sentry (erros)

`Sentry.AspNetCore` + `Sentry.Serilog`. **Só liga com DSN** (`Sentry__Dsn`); sem DSN não há nada ligado. Envia as
exceções não tratadas e os logs de nível Error (com o rasto) e guarda os logs Information como migalhas. Sem
dados pessoais: `SendDefaultPii = false` e sem corpos dos pedidos. `Sentry__TracesSampleRate` (0 por defeito)
liga a medição de desempenho.

### Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `ConnectionStrings__Financas` | Ligação à base de dados (Neon); sem ela, em Development usa SQLite |
| `PORT` | Porta (o Render define-a) |
| `Alertas__SegredoCron` | Segredo do cron (`X-Cron-Secret`) do envio de alertas por push. **Vazio = endpoint desativado (404)** |
| `Alertas__ExpoAccessToken` | Opcional: *access token* do Expo (só se a conta tiver a segurança reforçada) |
| `Sentry__Dsn` | DSN do Sentry. Vazio = Sentry desligado |
| `Sentry__TracesSampleRate` | Opcional (0 a 1; 0 por defeito) |
| `LimitesPedidos__PorMinuto` / `LimitesPedidos__PesadosPorMinuto` | Limites de pedidos (120 e 10). Os contadores são **em memória: só valem para uma instância** |
| `Cors__Origens__0`, ... | Origens permitidas |

## Correr no PC

Precisa do .NET 10 SDK. Sem PostgreSQL, a API usa um ficheiro SQLite (`financas-dev.db`, ver
`appsettings.Development.json`), que é criado sozinho.

```bash
cd backend
dotnet run --project src/Financas.Api        # http://localhost:5080  (Scalar em /scalar)
```

- Para experimentar sem token, põe `"Autenticacao": { "CabecalhoDesenvolvimento": true }` no
  `appsettings.Development.json` e envia o cabeçalho `X-Utilizador: teste`. Isto **só existe em
  Development**: em Production nem é registado.
- Para a app usar a API local, põe `EXPO_PUBLIC_API_URL=http://localhost:5080` no `frontend/.env`.
  No emulador Android, o PC é `http://10.0.2.2:5080`.
- Para usar o PostgreSQL da Neon localmente, define a ligação sem a pôr em ficheiros:
  `dotnet user-secrets set ConnectionStrings:Financas "postgresql://..." --project src/Financas.Api`.
  Aceita o formato URI da Neon (`postgresql://utilizador:password@host/bd?sslmode=require`) ou o
  formato do Npgsql (`Host=...;Database=...;Username=...;Password=...`).

## Testes

```bash
cd backend
dotnet test
```

- **Financas.Services.Tests**: as regras de `Calculos` e os serviços contra uma base SQLite em
  memória. São os mesmos cenários que a app tinha em TypeScript (saldos, salário, débitos, extras
  com data, despesas anuais, dívidas, folha do mês, importação do Excel, migração, concorrência).
- **Financas.Api.Tests**: a API inteira com `WebApplicationFactory`. Em vez do token do Firebase,
  usa o cabeçalho `X-Utilizador` através de um esquema de autenticação de teste.

O GitHub Actions corre estes testes em cada push (`.github/workflows/testes.yml`).

### Testes com PostgreSQL a sério (Testcontainers)

O SQLite é rápido, mas não é o PostgreSQL da Neon: os testes em SQLite criam as tabelas a partir
do modelo (`EnsureCreated`) e **nunca correm as migrações**, e o SQLite aceita coisas que o
PostgreSQL recusa. Por isso há uma segunda bateria, na pasta
`tests/Financas.Services.Tests/Postgres/`, que corre contra um PostgreSQL verdadeiro:

- **`PostgresFixture`** arranca, com o [Testcontainers](https://dotnet.testcontainers.org/), um
  contentor Docker `postgres:18-alpine` (um só para todos os testes; é apagado no fim). Cada teste
  recebe uma base de dados nova e vazia, e o `Ambiente` prepara-a como a API no arranque
  (`InicializarBaseDeDadosAsync`), ou seja, com `MigrateAsync` e as **migrações verdadeiras** da
  pasta `Migrations`. Não há nenhuma lista de tabelas escrita à mão: as migrações novas ficam
  cobertas sozinhas.
- **`TestesServicosPostgres`** é a mesma base dos testes de SQLite (`TestesServicos`, com os atalhos
  `Adicionar`, `AdicionarExtra`, `CalcularSaldoDisponivel`...), só com outra base de dados. Os
  cenários leem-se igual aos originais e têm os mesmos números.
- O que se testa: as migrações aplicam numa base vazia, criam as colunas do modelo (tipos
  `numeric(12,2)` e `NOT NULL`) e desfazem-se (`Down`); extras (adicionar, editar, mudar de mês,
  apagar) a acertar o saldo; valores ao cêntimo; salário uma vez por mês; débito e anulação de uma
  despesa mensal e o índice único dos pagamentos; **concorrência a sério** (dois pedidos ao mesmo
  tempo no mesmo saldo, dois a criar o mesmo utilizador, o salário com a app aberta em dois
  dispositivos); a cópia do Firestore e a importação da folha do mês.
- **`[FactPostgres]`** em vez de `[Fact]`: sem Docker (como neste PC), os testes aparecem como
  **ignorados** ("Skipped", com o motivo) e o `dotnet test` continua verde e rápido. A verificação
  é só ver se existe o *pipe*/*socket* do Docker ou o `DOCKER_HOST`.

| Variável de ambiente | Efeito |
|---|---|
| (nenhuma) | Correm se houver Docker; senão ficam ignorados |
| `FINANCAS_TESTES_POSTGRES=obrigatorio` | Correm sempre e **falham** se não houver Docker (o CI usa isto, para nunca ficar verde sem os ter corrido) |
| `FINANCAS_TESTES_POSTGRES=nao` | Nunca correm |
| `FINANCAS_TESTES_POSTGRES_LIGACAO="Host=localhost;Username=postgres;Password=..."` | Usa um PostgreSQL que já existe em vez do Docker; cada teste cria lá a sua base de dados (`teste_...`) e no fim são apagadas. O utilizador tem de poder fazer `CREATE DATABASE` |
| `FINANCAS_TESTES_POSTGRES_IMAGEM=postgres:18-alpine` | Outra versão do PostgreSQL (deve ser a da Neon: vê-se no resumo da cópia de segurança) |

```bash
dotnet test --filter "BaseDeDados=PostgreSQL"    # só estes
dotnet test --filter "BaseDeDados!=PostgreSQL"   # todos os outros
```

No GitHub Actions (que tem Docker), o job `backend` corre primeiro os testes de SQLite e depois,
num passo à parte, os de PostgreSQL, com a lista de cada teste no log. Esse job corre com
`TZ=Europe/Lisbon`, para apanhar horas gravadas com o offset local em vez de UTC (o
`timestamp with time zone` do PostgreSQL só aceita UTC).

Há ainda um teste que corre sempre, sem base de dados (`ModeloEMigracoesTests`): falha se o modelo
do EF Core mudou e ninguém gerou a migração.

## Mudar a base de dados (migrações)

```bash
cd backend
dotnet tool restore
dotnet ef migrations add NomeDaMudanca --project src/Financas.DAL
```

As migrações são para PostgreSQL e aplicam-se sozinhas quando a API arranca. Em SQLite
(desenvolvimento e testes) as tabelas são criadas diretamente a partir do modelo. O
`EnsureCreated` do SQLite não atualiza uma base que já existe: depois de uma migração nova, apaga
o `financas-dev.db` local para ele ser criado outra vez.

A migração `GastosRecorrentesPesquisaAuditoria` só acrescenta: as tabelas `GastosRecorrentes` e
`RegistosAlteracao` e, em `DespesasExtras`, as colunas opcionais `GastoRecorrenteId`, `DataOcorrencia` e
`ChaveIdempotencia`, com os índices únicos (utilizador, gasto, dia) e (utilizador, chave).

A migração `CategoriasOrcamentosObjetivosCartao` só acrescenta: as tabelas `Orcamentos` e
`ObjetivosPoupanca`, as colunas `DespesasExtras.Categoria` (opcional), `DespesasExtras.MeioPagamento`
(valor por defeito `Conta` nas linhas que já existem) e `Utilizadores.SaldoCartaoAlimentacao`
(0) / `CartaoAtualizadoEm`.

## Publicar (Neon + Render)

1. **Neon:** projeto `financas` (Frankfurt). Em *Connect*, com o *Connection pooling* desligado,
   copia a *connection string*. É secreta: não a ponhas no repositório.
2. **Render:** *New → Blueprint →* este repositório. O `render.yaml` cria o web service
   `financas-api` (plano Free, Docker, Frankfurt). Quando o Render pedir
   `ConnectionStrings__Financas`, cola a *connection string* da Neon. No primeiro arranque, a API
   cria as tabelas.
3. Na app, `EXPO_PUBLIC_API_URL=https://<o-teu-serviço>.onrender.com` no `.env`. Depois publica a
   web (`cd frontend && npm run deploy:web`) e gera um APK novo.
4. **Keep-alive (opcional):** o plano Free adormece ao fim de 15 minutos sem pedidos e demora
   cerca de 1 minuto a acordar. No **cron-job.org** cria um *cron job* para
   `https://<o-teu-serviço>.onrender.com/saude` de 10 em 10 minutos. Ligado 24 horas por dia gasta
   cerca de 744 horas por mês, dentro das 750 grátis. O `/saude` não acorda a base de dados.

Cada push que mexa em `backend/` volta a publicar a API sozinho, mas **só depois de o CI passar**:
o `render.yaml` tem `autoDeployTrigger: checksPass` (substitui o antigo `autoDeploy: true`) e o
`buildFilter` limita a `backend/**`. Se o workflow *Testes* falhar, o Render não publica.

O que confirmar no painel do Render (o Blueprint só aplica a mudança a serviços criados por ele; se
o serviço já existia, sincroniza o Blueprint ou muda à mão):

1. **financas-api → Settings → Build & Deploy → Auto-Deploy** deve estar em **After CI checks pass**
   (e não *On Commit*). Se o repositório não estiver ligado ao GitHub com as *checks* visíveis,
   o Render não vê o CI: confirma em *Settings → Build & Deploy → Repository*.
2. Em **Blueprints → (o teu blueprint) → Sync**, aceita a alteração do `render.yaml`.
3. Se mexeres só fora de `backend/` (por exemplo `.github/`), não há deploy: é o esperado.
4. Variáveis de ambiente novas que a API passe a precisar (por exemplo o segredo dos alertas
   push, `ALERTAS_SEGREDO_CRON`, o mesmo valor do segredo do GitHub) acrescentam-se em
   **Environment**; não vão no `render.yaml`.

## Cópias de segurança

O workflow `.github/workflows/backup.yml` faz uma cópia da base de dados da Neon **todos os
domingos às 03:00 UTC** e guarda-a no GitHub durante **90 dias**:

1. Corre o `pg_dump` dentro da imagem Docker oficial `postgres:18-alpine`. O `pg_dump` tem de ser
   da versão do servidor ou mais recente; assim não depende do que vem instalado na máquina do
   GitHub, e o 18 copia servidores até ao 18. Usa o formato *custom* (comprimido, restaurável com
   `pg_restore`) com `--no-owner --no-privileges`, para se poder restaurar com outro utilizador.
2. Se houver o segredo `BACKUP_PASSWORD`, cifra a cópia com `gpg` (AES-256) **antes** do upload.
   Sem ele, a cópia vai sem cifra (o repositório é privado) e o run mostra um aviso a recomendá-la.
3. Guarda o ficheiro como artefacto `backup-financas-AAAA-MM-DD`, com a versão do servidor e do
   `pg_dump`. O resumo do run mostra o tamanho, o número de tabelas e a versão do PostgreSQL da Neon.

A *connection string* nunca aparece no log: vai para o `pg_dump` por variável de ambiente, e o
GitHub esconde os segredos (`***`). O workflow também esconde a password e o host sozinhos.

**Sem o segredo `NEON_DATABASE_URL`, a cópia está desligada.** O run termina a verde, sem falhar
nem enviar emails, e o resumo diz "Backup desligado".

### Ligar a cópia (segredos)

No GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

| Nome | Valor |
|---|---|
| `NEON_DATABASE_URL` | A *connection string* da Neon em formato URI, **sem pooling** (no *Connect* da Neon, com *Connection pooling* desligado: o host não tem `-pooler`): `postgresql://utilizador:password@ep-...neon.tech/financas?sslmode=require&channel_binding=require`. O `sslmode` e o `channel_binding` podem ficar (o `pg_dump` 18 conhece-os). O formato `Host=...;Database=...` do Npgsql não serve aqui |
| `BACKUP_PASSWORD` | (Opcional, recomendado) uma password comprida só para as cópias. **Guarda-a fora do GitHub**, por exemplo no gestor de passwords: sem ela não há forma de abrir as cópias |

### Fazer uma cópia agora

**Actions → Cópia de segurança → Run workflow** (branch `main`). O agendamento semanal só funciona
depois de o workflow estar no `main`.

### Descarregar

Abre o run (Actions → Cópia de segurança). Em baixo, em **Artifacts**, está o
`backup-financas-AAAA-MM-DD`: descarrega-o e descomprime o zip. Também dá pela linha de comandos:
`gh run download <id-do-run> -n backup-financas-AAAA-MM-DD`.

Lá dentro está o `financas-AAAA-MM-DD.dump.gpg` (cifrado) ou o `financas-AAAA-MM-DD.dump`.

### Restaurar

> **Nunca restaures diretamente na base de dados de produção.** O `--clean` apaga as tabelas antes
> de as criar outra vez. Experimenta sempre primeiro num **branch separado da Neon** (ou num
> PostgreSQL local), confirma os dados e só depois decide o que fazer.

1. **Decifrar** (só se for `.gpg`). O `gpg` já vem com o Git Bash; pede a `BACKUP_PASSWORD`:
   ```bash
   gpg --decrypt --output financas.dump financas-2026-10-04.dump.gpg
   ```
2. **Criar onde restaurar.** Na consola da Neon: **Branches → Create branch** (por exemplo
   `teste-restauro`). Depois, em *Connect*, escolhe esse branch e copia a *connection string* sem
   pooling. É uma cópia separada: mexer nela não toca no `main`.
3. **Restaurar** com o `pg_restore` 18 ou mais recente (as ferramentas de linha de comandos do
   PostgreSQL 18 para Windows: no instalador basta escolher *Command Line Tools*):
   ```bash
   pg_restore --clean --if-exists --no-owner --no-privileges \
     --dbname="postgresql://...@ep-...-teste-restauro...neon.tech/financas?sslmode=require" financas.dump
   ```
   Com Docker, sem instalar nada: `docker run --rm -v "$PWD:/c" postgres:18-alpine pg_restore
   --clean --if-exists --no-owner --no-privileges --dbname="<url>" /c/financas.dump`.
   Para um PostgreSQL local, cria antes uma base de dados vazia (`createdb financas_restauro`) e
   usa-a no `--dbname`.
4. **Confirmar.** Por exemplo `psql "<url>" -c 'SELECT count(*) FROM "Utilizadores"'`, ou pôr a API
   local a usar esse branch (`dotnet user-secrets set ConnectionStrings:Financas "<url>" --project
   src/Financas.Api`) e ver os dados no Scalar. No fim, apaga o branch de teste.

Para voltar atrás poucas horas, a Neon tem também o seu próprio restauro para um instante
anterior (*Restore*/*Time Travel*). No plano grátis a janela é curta, por isso as cópias
semanais continuam a fazer falta.

Os artefactos contam para o espaço de artefactos do GitHub, mas uma cópia destas tem poucos KB.

### Testar o restauro (mensal, automático)

O workflow `.github/workflows/restaurar-backup.yml` ("Testar restauro da cópia") corre no **dia 5
de cada mês, às 05:00 UTC**, e à mão em *Actions → Testar restauro da cópia → Run workflow*:

1. Vai buscar o artefacto `backup-financas-*` mais recente que ainda não expirou.
2. Decifra-o (precisa do segredo `BACKUP_PASSWORD` se a cópia for `.gpg`).
3. Restaura-o com o `pg_restore` 18 para um PostgreSQL temporário (contentor de serviço do
   GitHub; desaparece no fim). Não toca na Neon.
4. Conta as linhas de cada tabela e compara-as com o **manifesto** `contagens.tsv` que o
   `backup.yml` grava dentro do artefacto (uma linha `tabela<TAB>linhas` por tabela, só números;
   gerado por `.github/scripts/contar-linhas.sh`). Se alguma diferir, o run falha e o GitHub envia email.
   O resumo do run mostra a tabela com as duas contagens.

Notas: as contagens do manifesto são feitas mesmo antes do `pg_dump`; se a app gravar algo nesse
intervalo, pode haver uma diferença de 1 linha: repete o teste. As cópias feitas antes do manifesto
existir não têm `contagens.tsv`: nesse caso só se confirma que o restauro corre (aviso no run).
Sem `NEON_DATABASE_URL` e sem cópias, o teste termina a verde com um aviso; com
`NEON_DATABASE_URL` mas sem cópias, falha (as cópias deviam existir).

## Integração contínua e automatismos (GitHub Actions)

| Workflow / ficheiro | Quando | O que faz |
|---|---|---|
| `testes.yml` | push no `main`, pull requests | TypeScript, jest e testes da API; **cobertura** (jest, e coverlet + ReportGenerator na API) no resumo do run e nos artefactos `cobertura-frontend` / `cobertura-backend` (30 dias), sem limiares; job `contrato-api` (não bloqueante) que avisa se `services/api-types.ts` divergir da API |
| `seguranca.yml` | push no `main`, pull requests, **segundas às 06:00 UTC** | `npm audit --omit=dev --audit-level=high` e `dotnet list package --vulnerable --include-transitive`; falha se houver vulnerabilidades |
| `dependabot.yml` | semanal (segunda, 07:00 Lisboa) | PRs de atualização de npm, NuGet e GitHub Actions; minor/patch agrupados num só PR por ecossistema. O Expo/React Native/React major ficam de fora (atualizam-se com o SDK) |
| `backup.yml` / `restaurar-backup.yml` | semanal / mensal | ver *Cópias de segurança* |
| `alertas.yml` | todos os dias às 08:00 de Lisboa | `POST $API_URL/api/interno/alertas/enviar` com o cabeçalho `X-Cron-Secret` (alertas push) |

### Segredos do GitHub (Settings → Secrets and variables → Actions)

| Segredo | Para quê |
|---|---|
| `NEON_DATABASE_URL`, `BACKUP_PASSWORD` | cópias e teste de restauro (ver acima) |
| `API_URL` | endereço da API sem barra no fim, por exemplo `https://financas-api.onrender.com` (alertas) |
| `ALERTAS_SEGREDO_CRON` | segredo partilhado dos alertas: o **mesmo valor** tem de estar na API (variável de ambiente no painel do Render, ver o endpoint `/api/interno/alertas/enviar`). Sem `API_URL` ou sem este segredo, o workflow termina a verde com um aviso |

O cron do GitHub é em UTC; o `alertas.yml` tem dois agendamentos (07:00 e 08:00 UTC) e só corre o
que calhar às 08:00 em Lisboa, por causa da hora de verão. O GitHub pode atrasar os agendamentos uns
minutos, e como a API gratuita adormece, o primeiro pedido pode demorar cerca de 1 minuto (há repetições).

### Tipos TypeScript a partir da API (`npm run gerar:api`)

Em `frontend/`, `npm run gerar:api` gera `services/api-types.ts` com o `openapi-typescript` a partir
do documento OpenAPI da API (`/openapi/v1.json`, o `MapOpenApi()` do `Program.cs`; a interface
do Scalar em `/scalar` é só em Development). O script (`frontend/scripts/gerar-api-types.mjs`)
arranca a API local com uma base SQLite temporária, descarrega o documento, gera o ficheiro e pára a
API; precisa do SDK do .NET 10 e de `npm ci`. Para usar uma API que já está a correr:
`OPENAPI_URL=https://.../openapi/v1.json npm run gerar:api`. `npm run gerar:api -- --verificar`
não escreve nada e sai com erro se o ficheiro commitado estiver desatualizado (é o que o CI usa, só
como aviso). O ficheiro ainda não foi gerado nem é usado pela app: gera-o e faz commit quando o
quiseres usar.

## Passagem dos dados do Firestore

Os dados que estavam no Firestore passam para a API uma única vez, sem precisares de fazer nada:

1. Depois do login, a app pergunta `GET /api/migracao/estado` se o servidor já tem dados deste utilizador.
2. Se não tiver, lê do Firestore tudo o que é desse utilizador, só a ler
   (`services/migracaoFirestore.ts`): perfil, conta, salário, despesas mensais e pagamentos,
   extras, poupanças, dívidas e meses.
3. Envia tudo para `POST /api/migracao`, que grava numa transação e mantém os ids. Se o utilizador
   já tiver dados no servidor, responde 409 e não mexe em nada.

Depois disto, a app já não escreve no Firestore. O Firebase fica só para o login e para alojar a versão web.
