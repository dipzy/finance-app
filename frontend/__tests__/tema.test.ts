// Tema escuro/claro: contraste mínimo AA (WCAG 2.1) dos pares de cores de cada paleta e a escolha do esquema.
import { esquemaAplicado } from '../constants/tema';
import { ePreferenciaTema, resolverEsquema } from '../constants/esquema';
import { temas, type Esquema } from '../constants/paletas';

type RGBA = [number, number, number, number];

function analisar(cor: string): RGBA {
  const rgba = cor.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a = '1'] = rgba[1].split(',').map((p) => p.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  const h = cor.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
}

// A cor `frente` (com a sua transparência) por cima de `fundo` opaco
function sobre(frente: string, fundo: string): string {
  const [r, g, b, a] = analisar(frente);
  const [fr, fg, fb] = analisar(fundo);
  const m = (c: number, f: number) => Math.round(c * a + f * (1 - a));
  return `rgb(${m(r, fr)},${m(g, fg)},${m(b, fb)})`;
}

function luminancia(cor: string): number {
  const [r, g, b] = analisar(cor).slice(0, 3).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [la, lb] = [luminancia(a), luminancia(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const ESQUEMAS: Esquema[] = ['escuro', 'claro'];

describe.each(ESQUEMAS)('paleta %s', (esquema) => {
  const { cores, gradientes, acentosCategorias, acentosFolha } = temas[esquema];
  // Onde o texto aparece: o fundo, os cartões (vidro por cima do fundo), as superfícies sólidas
  const fundos = {
    fundo: cores.fundo,
    fundoAlto: cores.fundoAlto,
    cartao: sobre(cores.superficie, cores.fundo),
    cartaoAlto: sobre(cores.superficieAlta, cores.fundo),
    solida: cores.superficieSolida,
  };

  it.each(Object.entries(fundos))('os textos têm contraste AA sobre %s', (_nome, fundo) => {
    expect(contraste(cores.texto, fundo)).toBeGreaterThanOrEqual(7);
    expect(contraste(cores.textoSecundario, fundo)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(cores.textoMudo, fundo)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(fundos))('os acentos usados em texto têm contraste AA sobre %s', (_nome, fundo) => {
    for (const acento of ['primaria', 'positivo', 'negativo', 'violetaTexto', 'aviso', 'laranja', 'azul'] as const) {
      expect([acento, contraste(cores[acento], fundo) >= 4.5]).toEqual([acento, true]);
    }
  });

  it('as categorias e os blocos da folha são legíveis sobre o fundo e os cartões', () => {
    for (const [nome, cor] of [...Object.entries(acentosCategorias), ...Object.entries(acentosFolha)]) {
      expect([nome, contraste(cor, fundos.fundo) >= 4.5, contraste(cor, fundos.cartaoAlto) >= 4.5]).toEqual([nome, true, true]);
    }
  });

  it('o texto dos botões principais tem contraste AA sobre as duas pontas do degradê', () => {
    for (const ponta of gradientes.primario) {
      expect(contraste(cores.sobreAcento, ponta)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('o texto por cima de um acento escolhido (chips) tem contraste AA', () => {
    for (const cor of [...Object.values(acentosCategorias).slice(0, 13), cores.primaria]) {
      expect([cor, contraste(cores.sobreAcento, cor) >= 4.5]).toEqual([cor, true]);
    }
  });

  it('o texto dos cartões de saldo (degradê translúcido) tem contraste AA', () => {
    for (const degrade of [gradientes.heroPrimario, gradientes.heroVioleta, gradientes.heroPositivo, gradientes.heroNegativo, gradientes.heroAviso, gradientes.heroLaranja]) {
      for (const ponta of degrade) {
        expect(contraste(cores.textoHero, sobre(ponta, fundos.cartao))).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('escolha do esquema', () => {
  it('"sistema" segue o sistema; "claro" e "escuro" ignoram-no', () => {
    expect(resolverEsquema('sistema', 'claro')).toBe('claro');
    expect(resolverEsquema('sistema', 'escuro')).toBe('escuro');
    expect(resolverEsquema('claro', 'escuro')).toBe('claro');
    expect(resolverEsquema('escuro', 'claro')).toBe('escuro');
  });

  it('só se aceitam as três preferências', () => {
    expect(['sistema', 'claro', 'escuro'].every(ePreferenciaTema)).toBe(true);
    expect(ePreferenciaTema('azul')).toBe(false);
    expect(ePreferenciaTema(undefined)).toBe(false);
  });

  it('nos testes a app arranca no escuro', () => {
    expect(esquemaAplicado).toBe('escuro');
  });
});
