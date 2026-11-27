import { ScrollViewStyleReset } from 'expo-router/html';

import { CHAVE_TEMA_WEB } from '../constants/esquema';
import { temas } from '../constants/paletas';

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        {/* Cor da barra do browser no telemóvel: a do fundo da app (a do tema escolhido, ver o script abaixo) */}
        <meta name="theme-color" content={temas.escuro.cores.fundo} />
        <meta name="color-scheme" content="dark light" />

        {/*
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        {/* O tema escolhido (ou o do sistema) logo no HTML: sem clarão da cor errada enquanto o JavaScript carrega */}
        <script dangerouslySetInnerHTML={{ __html: escolherTema }} />
        <style dangerouslySetInnerHTML={{ __html: fundoDoTema }} />
        {/* Add any additional <head> elements that you want globally available on web... */}
      </head>
      <body>{children}</body>
    </html>
  );
}

// Põe data-tema="claro|escuro" no <html>: a escolha guardada (services/tema.ts) ou, sem ela, a do sistema
const escolherTema = `
(function () {
  var tema = 'escuro';
  try {
    var guardado = localStorage.getItem('${CHAVE_TEMA_WEB}');
    if (guardado === 'claro' || guardado === 'escuro') tema = guardado;
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) tema = 'claro';
  } catch (e) {}
  document.documentElement.setAttribute('data-tema', tema);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', tema === 'claro' ? '${temas.claro.cores.fundo}' : '${temas.escuro.cores.fundo}');
})();`;

// O mesmo degradê do fundo dos ecrãs (gradientes.fundo em constants/paletas.ts), nos dois temas
function regrasDoTema(esquema: 'escuro' | 'claro') {
  const { cores, gradientes } = temas[esquema];
  return `
html[data-tema="${esquema}"], html[data-tema="${esquema}"] body {
  background-color: ${cores.fundo};
  color: ${cores.texto};
  color-scheme: ${esquema === 'claro' ? 'light' : 'dark'};
}
html[data-tema="${esquema}"] body {
  background-image: linear-gradient(180deg, ${gradientes.fundo[0]} 0%, ${gradientes.fundo[1]} 100%);
  background-attachment: fixed;
}`;
}

// Sem JavaScript (ou antes do script) fica o escuro, o tema original da app
const fundoDoTema = `
html, body { background-color: ${temas.escuro.cores.fundo}; color: ${temas.escuro.cores.texto}; }
${regrasDoTema('escuro')}
${regrasDoTema('claro')}`;
