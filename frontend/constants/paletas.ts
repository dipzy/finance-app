// As duas paletas da app (escuro e claro). constants/tema.ts escolhe uma ao arrancar e exporta os
// valores já prontos (cores, gradientes, sombras...) para os ecrãs usarem como sempre.
// Os testes (__tests__/tema.test.ts) medem o contraste dos pares de cores de cada paleta (WCAG AA).

// "#00E5FF" + 0.2 -> "rgba(0,229,255,0.2)" (para fundos, bordas e brilhos de um acento)
export function comAlfa(hex: string, alfa: number): string {
  const limpo = hex.replace('#', '');
  const r = parseInt(limpo.slice(0, 2), 16);
  const g = parseInt(limpo.slice(2, 4), 16);
  const b = parseInt(limpo.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alfa})`;
}

// Os degradês do expo-linear-gradient precisam de pelo menos duas cores
export type Degrade = readonly [string, string, ...string[]];

export type Esquema = 'escuro' | 'claro';

export interface Cores {
  fundo: string;
  fundoAlto: string;
  superficie: string;
  superficieAlta: string;
  superficiePremida: string;
  superficieSolida: string;
  cabecalho: string;
  borda: string;
  bordaForte: string;
  sobreposicao: string;
  texto: string;
  textoSecundario: string;
  textoMudo: string;
  desativado: string;
  textoHero: string;
  sobreAcento: string;
  primaria: string;
  primariaSuave: string;
  positivo: string;
  negativo: string;
  violeta: string;
  violetaTexto: string;
  aviso: string;
  laranja: string;
  azul: string;
}

export interface Gradientes {
  fundo: Degrade;
  primario: Degrade;
  heroPrimario: Degrade;
  heroVioleta: Degrade;
  heroPositivo: Degrade;
  heroNegativo: Degrade;
  heroAviso: Degrade;
  heroLaranja: Degrade;
  progresso: Degrade;
  avatar: Degrade;
  menu: Degrade;
}

export interface Tema {
  esquema: Esquema;
  cores: Cores;
  gradientes: Gradientes;
  sombras: { cartao: string; botao: string; menu: string };
  acentosFolha: Record<'lucro' | 'despesas' | 'poupanca' | 'despesasMes' | 'anual' | 'conta', string>;
  acentosCategorias: Record<string, string>;
}

// ---- Escuro: "fintech" (fundo azul-marinho, cartões de vidro, acentos néon) ----

const coresEscuro: Cores = {
  // Fundo: azul-marinho quase preto, com um degradê vertical suave (ver gradientes.fundo)
  fundo: '#070B14',
  fundoAlto: '#0B1222',
  // Superfícies "vidro": branco muito transparente por cima do fundo
  superficie: 'rgba(255,255,255,0.04)',
  superficieAlta: 'rgba(255,255,255,0.07)',
  superficiePremida: 'rgba(255,255,255,0.10)',
  // Superfícies opacas (modais, menu lateral): por cima de outro conteúdo o vidro não se lê bem
  superficieSolida: '#0E1628',
  cabecalho: 'rgba(7,11,20,0.94)',
  borda: 'rgba(255,255,255,0.08)',
  bordaForte: 'rgba(255,255,255,0.16)',
  sobreposicao: 'rgba(2,4,10,0.75)',

  texto: '#E6EDF7',
  textoSecundario: '#8B9BB4',
  // Notas, ajudas e placeholders. Mais claro do que o #5B6B85 do guia: esse fica abaixo de 4,5:1 nos cartões
  textoMudo: '#7A8AA3',
  // Só para o que está desativado (as WCAG não pedem contraste aí) e para elementos decorativos
  desativado: '#5B6B85',
  // Texto dos cartões de saldo (por cima do degradê translúcido)
  textoHero: '#C9D4E5',
  // Texto por cima de um acento claro (botões principais, chips escolhidos)
  sobreAcento: '#03060D',

  primaria: '#00E5FF',
  primariaSuave: '#22D3EE',
  positivo: '#00F5A0', // dinheiro que entra, "pago"
  negativo: '#FF4D8D', // despesas, valores negativos, ações destrutivas
  violeta: '#7C5CFF',
  // O violeta puro não chega a 4,5:1 em texto pequeno: este tom é o que se usa em texto
  violetaTexto: '#A48DFF',
  aviso: '#FFC857',
  laranja: '#FF8A3D',
  azul: '#4D9FFF',
};

// ---- Claro: fundo azulado muito claro, cartões brancos e os mesmos acentos em tons escuros ----
// Cada acento foi escurecido até ter pelo menos 4,5:1 sobre o fundo e sobre os cartões (texto pequeno)

const coresClaro: Cores = {
  fundo: '#F3F6FB',
  fundoAlto: '#FFFFFF',
  // Superfícies: tinta azul-marinho muito transparente por cima do fundo
  superficie: 'rgba(15,23,42,0.04)',
  superficieAlta: 'rgba(15,23,42,0.07)',
  superficiePremida: 'rgba(15,23,42,0.11)',
  superficieSolida: '#FFFFFF',
  cabecalho: 'rgba(243,246,251,0.94)',
  borda: 'rgba(15,23,42,0.10)',
  bordaForte: 'rgba(15,23,42,0.22)',
  sobreposicao: 'rgba(15,23,42,0.50)',

  texto: '#0F172A',
  textoSecundario: '#475569',
  textoMudo: '#566478',
  desativado: '#94A3B8',
  textoHero: '#1E293B',
  // Texto por cima dos acentos escuros (botões principais, chips escolhidos)
  sobreAcento: '#FFFFFF',

  primaria: '#0B6075',
  primariaSuave: '#0B6075',
  positivo: '#036A4C',
  negativo: '#BE123C',
  violeta: '#6D4AFF',
  violetaTexto: '#5B3FE0',
  aviso: '#854D0E',
  laranja: '#B03A0A',
  azul: '#1D4ED8',
};

function gradientesEscuro(): Gradientes {
  return {
    fundo: ['#070B14', '#0B1222'],
    // Botões principais (o texto por cima é cores.sobreAcento)
    primario: ['#00E5FF', '#7C5CFF'],
    // Cartões de saldo: translúcidos, para o número claro por cima ter contraste
    heroPrimario: ['rgba(0,229,255,0.22)', 'rgba(124,92,255,0.28)'],
    heroVioleta: ['rgba(124,92,255,0.32)', 'rgba(255,77,141,0.16)'],
    heroPositivo: ['rgba(0,245,160,0.20)', 'rgba(0,229,255,0.14)'],
    heroNegativo: ['rgba(255,77,141,0.28)', 'rgba(124,92,255,0.18)'],
    heroAviso: ['rgba(255,200,87,0.22)', 'rgba(255,138,61,0.14)'],
    heroLaranja: ['rgba(255,138,61,0.24)', 'rgba(255,77,141,0.16)'],
    // Barras de progresso (quanto de uma dívida já foi pago)
    progresso: ['#00F5A0', '#00E5FF'],
    // Avatar do menu lateral
    avatar: ['#00E5FF', '#7C5CFF'],
    menu: ['#0E1628', '#070B14'],
  };
}

function gradientesClaro(): Gradientes {
  return {
    fundo: ['#F3F6FB', '#E9EFF8'],
    // As duas pontas têm 4,5:1 com o texto branco por cima
    primario: ['#0E7490', '#5B3FE0'],
    heroPrimario: ['rgba(11,96,117,0.14)', 'rgba(109,74,255,0.16)'],
    heroVioleta: ['rgba(109,74,255,0.18)', 'rgba(190,18,60,0.08)'],
    heroPositivo: ['rgba(3,106,76,0.14)', 'rgba(11,96,117,0.08)'],
    heroNegativo: ['rgba(190,18,60,0.14)', 'rgba(109,74,255,0.08)'],
    heroAviso: ['rgba(133,77,14,0.16)', 'rgba(176,58,10,0.08)'],
    heroLaranja: ['rgba(176,58,10,0.14)', 'rgba(190,18,60,0.08)'],
    progresso: ['#047857', '#0E7490'],
    avatar: ['#0E7490', '#5B3FE0'],
    menu: ['#FFFFFF', '#F3F6FB'],
  };
}

function criarTema(esquema: Esquema, cores: Cores, gradientes: Gradientes, sombras: Tema['sombras'], extras: Record<string, string>): Tema {
  return {
    esquema,
    cores,
    gradientes,
    sombras,
    // Acentos de cada bloco da folha do mês: as cores do livro Excel passadas para a paleta da app
    // (Lucro azul, Despesas laranja, Poupança dourado, Despesas do Mês roxo, Anual verde, Conta azul da app)
    acentosFolha: {
      lucro: cores.azul,
      despesas: cores.laranja,
      poupanca: cores.aviso,
      despesasMes: cores.violetaTexto,
      anual: cores.positivo,
      conta: cores.primaria,
    },
    // Acento de cada categoria das despesas extras (ícone, chip e barras dos gráficos): todos com
    // contraste suficiente para texto pequeno. As chaves são as da API
    acentosCategorias: {
      supermercado: cores.positivo,
      restauracao: cores.laranja,
      transportes: cores.azul,
      carro: extras.carro,
      combustivel: cores.aviso,
      casa: cores.primariaSuave,
      telecomunicacoes: extras.telecomunicacoes,
      saude: cores.negativo,
      lazer: cores.violetaTexto,
      compras: extras.compras,
      educacao: extras.educacao,
      viagens: extras.viagens,
      presentes: extras.presentes,
      outros: cores.textoSecundario,
    },
  };
}

export const temas: Record<Esquema, Tema> = {
  escuro: criarTema(
    'escuro',
    coresEscuro,
    gradientesEscuro(),
    {
      cartao: '0 8px 24px rgba(0,0,0,0.35)',
      botao: `0 6px 20px ${comAlfa(coresEscuro.primaria, 0.22)}`,
      menu: '8px 0 32px rgba(0,0,0,0.6)',
    },
    { carro: '#F472B6', telecomunicacoes: '#818CF8', compras: '#E879F9', educacao: '#A3E635', viagens: '#2DD4BF', presentes: '#FF7A7A' }
  ),
  claro: criarTema(
    'claro',
    coresClaro,
    gradientesClaro(),
    {
      cartao: '0 6px 20px rgba(15,23,42,0.08)',
      botao: `0 6px 20px ${comAlfa(coresClaro.primaria, 0.28)}`,
      menu: '8px 0 32px rgba(15,23,42,0.20)',
    },
    { carro: '#BE185D', telecomunicacoes: '#4338CA', compras: '#A21CAF', educacao: '#3F6212', viagens: '#0D6B63', presentes: '#B91C1C' }
  ),
};
