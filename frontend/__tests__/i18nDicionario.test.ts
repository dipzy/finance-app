// O dicionário de inglês está completo e sem conflitos:
//  - toda a chave t('...') do código existe no dicionário (i18n/textos/);
//  - não há t(`template literal`) no código (usar chave estática + parâmetros);
//  - a mesma chave não aparece em dois ficheiros com traduções diferentes;
//  - ficheiros de app/ e components/ com texto traduzido chamam useT().

import * as fs from 'fs';
import * as path from 'path';
import { en } from '../i18n/textos';
import { comum } from '../i18n/textos/comum';
import { navegacao } from '../i18n/textos/navegacao';
import { painel } from '../i18n/textos/painel';
import { despesas } from '../i18n/textos/despesas';
import { poupancas } from '../i18n/textos/poupancas';
import { importar } from '../i18n/textos/importar';
import { definicoes } from '../i18n/textos/definicoes';
import { utilitarios } from '../i18n/textos/utilitarios';
import { partilhar } from '../i18n/textos/partilhar';
import { qualidade } from '../i18n/textos/qualidade';
import { dividas } from '../i18n/textos/dividas';
import { extrato } from '../i18n/textos/extrato';
import { simulador } from '../i18n/textos/simulador';

const raiz = path.resolve(__dirname, '..');
const PASTAS = ['app', 'components', 'services', 'utils', 'contexts'];

function listarFicheiros(): string[] {
  const ficheiros: string[] = [];
  for (const pasta of PASTAS) {
    const caminho = path.join(raiz, pasta);
    if (!fs.existsSync(caminho)) continue;
    const percorrer = (dir: string) => {
      for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        const completo = path.join(dir, entrada.name);
        if (entrada.isDirectory()) {
          percorrer(completo);
        } else if (
          (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) &&
          !entrada.name.endsWith('.test.ts') &&
          !entrada.name.endsWith('.test.tsx')
        ) {
          ficheiros.push(completo);
        }
      }
    };
    percorrer(caminho);
  }
  return ficheiros;
}

// t('chave') / t("chave") — uma chamada pode ter parâmetros a seguir, não interessa
// Suporta aspas escapadas (\') e aspas do outro tipo dentro da string
const CHAMADA = /\bt\(\s*(['"])((?:(?!\1).)*)\1/g;
const TEMPLATE_EM_T = /\bt\(\s*`/;
const CHAMADA_PRESENTE = /\bt\(\s*['"]/;
const USE_T_PRESENTE = /\buseT\(/;

describe('dicionário i18n', () => {
  const ficheiros = listarFicheiros();
  const asChaves: Record<string, string[]> = {};

  it('não há t(`template literal`) no código', () => {
    for (const f of ficheiros) {
      const conteudo = fs.readFileSync(f, 'utf8');
      if (TEMPLATE_EM_T.test(conteudo)) {
        throw new Error(`t() com template literal em ${path.relative(raiz, f)} — usar chave estática + parâmetros: t('...{x}...', { x })`);
      }
    }
  });

  it('toda a chave t(\'...\') do código existe no dicionário', () => {
    const emFalta = new Set<string>();
    for (const f of ficheiros) {
      const conteudo = fs.readFileSync(f, 'utf8');
      for (const m of conteudo.matchAll(CHAMADA)) {
        let chave = m[2]; // group 2 = conteúdo (group 1 = aspa)
        // Converter escape sequences comuns (\n, \t, \\, \", \') para os caracteres reais
        chave = chave.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\').replace(/\\"/g, '"').replace(/\\'/g, "'");
        if (!(chave in en)) emFalta.add(chave);
        (asChaves[chave] ??= []).push(path.relative(raiz, f));
      }
    }
    if (emFalta.size > 0) {
      const lista = [...emFalta].sort();
      throw new Error(
        `Faltam ${lista.length} chave(s) no dicionário (i18n/textos/):\n${lista.map((c) => `  - ${c}`).join('\n')}`
      );
    }
  });

  it('fichas de app/ e components/ com texto traduzido usam useT()', () => {
    const semUseT: string[] = [];
    for (const f of ficheiros) {
      const relativo = path.relative(raiz, f);
      const eComponente = relativo.startsWith(`app${path.sep}`) || relativo.startsWith(`components${path.sep}`);
      if (!eComponente) continue;
      const conteudo = fs.readFileSync(f, 'utf8');
      if (CHAMADA_PRESENTE.test(conteudo) && !USE_T_PRESENTE.test(conteudo)) {
        semUseT.push(relativo);
      }
    }
    if (semUseT.length > 0) {
      throw new Error(`Ficheiros de ecrã com t('...') sem const t = useT();:\n${semUseT.map((f) => `  - ${f}`).join('\n')}`);
    }
  });

  it('os ecrãs não mostram o nome de categoria em português: usam nomeCategoria() ou t(info.nome)', () => {
    // infoCategoria(x).nome devolve sempre português (serve o Excel); o que o utilizador vê passa por t()
    const CRU = /infoCategoria\([^)]*\)\.nome|(?<!\bt\()\binfo\.nome\b/;
    const crus: string[] = [];
    for (const f of ficheiros) {
      const relativo = path.relative(raiz, f);
      if (relativo === path.join('utils', 'categorias.ts')) continue;
      fs.readFileSync(f, 'utf8')
        .split('\n')
        .forEach((linha, i) => {
          if (CRU.test(linha) && !linha.trim().startsWith('//')) crus.push(`${relativo}:${i + 1}  ${linha.trim()}`);
        });
    }
    if (crus.length > 0) {
      throw new Error(`Nome de categoria em português sem tradução (usar nomeCategoria(chave)):\n${crus.map((c) => `  - ${c}`).join('\n')}`);
    }
  });

  it('a mesma chave não aparece em dois ficheiros com traduções diferentes', () => {
    const fatias: Record<string, Record<string, string>> = {
      comum,
      navegacao,
      painel,
      despesas,
      poupancas,
      importar,
      definicoes,
      utilitarios,
      partilhar,
      qualidade,
      dividas,
      extrato,
      simulador,
    };
    const origens: Record<string, Map<string, string>> = {};
    for (const [nome, dicio] of Object.entries(fatias)) {
      for (const [chave, valor] of Object.entries(dicio)) {
        (origens[chave] ??= new Map()).set(nome, valor);
      }
    }
    const conflitos = Object.entries(origens)
      .filter(([, v]) => new Set(v.values()).size > 1)
      .map(([chave, v]) => `  - ${chave}: ${[...v].map(([nome, valor]) => `${nome}="${valor}"`).join(' vs ')}`);
    if (conflitos.length > 0) {
      throw new Error(`Chaves repetidas com traduções diferentes:\n${conflitos.join('\n')}`);
    }
    expect(conflitos).toEqual([]);
  });

  it('o dicionário não fica vazio', () => {
    expect(Object.keys(en).length).toBeGreaterThan(50);
  });
});