import { useEffect, useRef, useState } from 'react';
import { textoOrigemSugestao } from '../services/regras';
import type { Categoria, SugestaoCategoria } from '../services/tipos';

export interface SugestaoDoTitulo {
  titulo: string; // o título (sem espaços a mais) a que a sugestão responde
  categoria: Categoria;
  // "Regra: Continente" quando a categoria veio de uma regra de categorização (senão não há)
  origemTexto?: string;
}

// A categoria sugerida para o título que está a ser escrito: pergunta à API (sugerir) só quando se
// para de escrever (atrasoMs) e ignora respostas que cheguem fora de ordem. Devolve a última
// sugestão recebida, que pode ser de um título anterior: quem usa compara sugestao.titulo com o
// título atual para saber se já é a deste. Sem título (ou com ativo = false) devolve null.
// "sugerir" devolve só a categoria, ou a sugestão completa da API (com a origem e a regra).
export function useSugestaoCategoria(
  titulo: string,
  sugerir: ((titulo: string) => Promise<Categoria | SugestaoCategoria>) | undefined,
  ativo = true,
  atrasoMs = 400
): SugestaoDoTitulo | null {
  const [sugestao, setSugestao] = useState<SugestaoDoTitulo | null>(null);
  const ultimoPedido = useRef(0);
  const limpo = titulo.trim();

  useEffect(() => {
    if (!ativo || !sugerir || !limpo) return;
    const pedido = ++ultimoPedido.current;
    const espera = setTimeout(() => {
      sugerir(limpo).then(
        (resposta) => {
          if (pedido !== ultimoPedido.current) return;
          const categoria = typeof resposta === 'string' ? resposta : resposta.categoria;
          const origemTexto = typeof resposta === 'string' ? undefined : textoOrigemSugestao(resposta);
          setSugestao({ titulo: limpo, categoria, origemTexto });
        },
        // Sem sugestão (ex.: sem rede): fica a categoria que já estava escolhida
        () => undefined
      );
    }, atrasoMs);
    return () => clearTimeout(espera);
  }, [limpo, ativo, sugerir, atrasoMs]);

  return ativo && limpo ? sugestao : null;
}
