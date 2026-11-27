# Tradução PT/EN — regras para os ficheiros de ecrãs

A app ficou bilingue (português/inglês) com um sistema leve de i18n já pronto em `i18n/`.
O teu trabalho, para os ficheiros que te forem atribuídos, é:

1. **Envolver** cada texto visível ao utilizador em `t('...')` — o texto em português fica IGUAL.
2. **Acrescentar** a tradução inglesa na tua fatia do dicionário: `i18n/textos/<area>.ts`.

Já estão traduzidos (não mexer): o núcleo `i18n/`, `components/ui/*`, `components/Header.tsx`,
`components/DividirDespesaModal.tsx`, `app/(tabs)/poupanca-partilhada.tsx`, o seletor de idioma em
`app/(tabs)/definicoes.tsx`, e `services/api.ts`, `services/ligacao.ts`, `services/calculos.ts`
(nomeMes), `utils/categorias.ts` (nomeCategoria), `utils/helpers.ts`, `utils/confirmar.ts`.
As fatias `comum.ts` e `partilhar.ts` já estão cheias — só acrescentam as tuas.

## As peças

- `t(chave, params?)` — devolve o texto: em português devolve a própria chave; em inglês devolve a
  tradução do dicionário (e, se ainda não houver, fica o texto português).
- `useT()` — hook para os componentes: devolve um `t` e o componente volta a desenhar quando o
  idioma muda. **Qualquer componente que mostre texto traduzido tem de chamar `const t = useT();`.**
- Módulos que não são componentes (utils, services) usam o `t` importado (sem hook) — o valor é lido
  na hora.
- Interpolação: `t('Faltam {n} prestações', { n: 3 })` -> "Faltam 3 prestações" (pt) /
  "3 payments left" (en). Frases montadas com template literals convertem-se em chave estática
  com `{param}` + parâmetros (ver abaixo).

## Como importar

- Em `app/(tabs)/X.tsx`:        `import { t, useT } from '../../i18n';`
- Em `app/X.tsx` (login, modal): `import { t, useT } from '../i18n';`
- Em `components/X.tsx` e `utils/X.ts` / `services/X.ts`: `import { t, useT } from '../i18n';`
  (em `components/ui/X.tsx` é `../../i18n`; se o ficheiro só tiver `t`, importa só `t`).

## Regras

- Envolve TODO o texto que o utilizador vê: `<Text>…</Text>`, `titulo=`, `rotulo=`, `descricao=`,
  placeholders, mensagens de alerta/confirmação, etiquetas e `accessibilityLabel`/`accessibilityHint`
  (ex.: `<Botao titulo={t('Guardar')} />`, `<Text>{t('Sem despesas')}</Text>`).
- O texto em português NÃO muda (os testes verificam-no). Só é envolvido em `t('...')`.
- Template literals com valores viram chave + parâmetros:
  - Antes: `` `Faltam ${n} prestações` `` / `` `${nomeMes(mes)} - total` ``.
  - Depois: `t('Faltam {n} prestações', { n })` e `t('{mes} - total', { mes: nomeMes(mes) })`.
  A chave no dicionário é a frase com `{n}` no sítio certo.
- Listas e constantes de texto no topo do módulo (ex.: os itens do menu lateral, `SECOES_MENU`,
  `TEXTO_MINUTOS`, `DIAS_SEMANA`) têm de se resolver DENTRO do render ou numa função que recebe o
  idioma: se ficarem no topo, ficam "presas" no primeiro idioma que viram. Ex.:
  `const itens = SECOES_MENU(t)` dentro do componente, ou `function f(t) { … t('texto') … }`.
  Chaves de `Record<..., string>` servem de chave do dicionário (`t(TEXTO_MINUTOS[v])`).
- Módulos como `nomeMes()` / `nomeCategoria()` já devolvem texto traduzido (cuidado deles foi
  outro agente): nos componentes usa `useT()` para voltarem a desenhar quando o idioma muda.
- **NÃO traduzir** nem tocar: `console.log`/`console.error` (ficam em PT), comentários, nomes de
  chaves da API/dados/ids, conteúdo dos ficheiros Excel (cabeçalhos e folhas ficam em PT, para o
  importador continuar a reconhecer o que a app exporta), e ficheiros de testes (`__tests__`,
  `test-utils`).
- Dicionário: `chave = texto exato PT` (mesmos acentos, maiúsculas, pontuação e `…`) e
  `valor = tradução EN` natural. Não pôr no teu ficheiro palavras que já existam em `comum.ts`
  (Guardar, Cancelar, Erro, Avоso, meses, dias da semana, categorias, 'Início', 'Definições',
  'Pesquisar', 'Sair'…). Só acrescentas no fim do objeto; não apagues o que já lá estiver.
- Se encontrar uma chamada `mostrarAlerta('Erro', '…')` ou `confirmar('…')`, envolve os argumentos:
  `mostrarAlerta(t('Erro'), t('…'))`.
- Após terminares: `npx tsc --noEmit` — corrige os erros nos teus ficheiros (ignora erros noutros).

## Verificação automática

`__tests__/i18nDicionario.test.ts` garante (corre com `npx jest i18nDicionario`):
- toda a chave `t('...')` do código existe no dicionário;
- não há `t(\`…)` (template literal dentro de t) no código;
- não há a mesma chave em dois ficheiros com traduções diferentes;
- ficheiros de `app/` e `components/` com texto traduzido chamam `useT()`.