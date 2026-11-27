// Dicionário inglês completo: a CHAVE é o texto exato em português usado no código (t('...'));
// o VALOR é a tradução. Os ficheiros estão separados por área para cada um poder ser editado
// à parte. As palavras comuns (Guardar, Cancelar, Erro, meses, dias da semana, categorias...)
// vivem em comum.ts — não se repetem nos ficheiros de área.

import { comum } from './comum';
import { navegacao } from './navegacao';
import { painel } from './painel';
import { despesas } from './despesas';
import { poupancas } from './poupancas';
import { importar } from './importar';
import { definicoes } from './definicoes';
import { utilitarios } from './utilitarios';
import { partilhar } from './partilhar';
import { qualidade } from './qualidade';
import { regrasAlertas } from './regrasAlertas';
import { dividas } from './dividas';
import { extrato } from './extrato';
import { simulador } from './simulador';

export const en: Record<string, string> = {
  ...comum,
  ...navegacao,
  ...painel,
  ...despesas,
  ...poupancas,
  ...importar,
  ...definicoes,
  ...utilitarios,
  ...partilhar,
  ...qualidade,
  ...regrasAlertas,
  ...dividas,
  ...extrato,
  ...simulador,
};