// Avisos entre partes da app que não se conhecem (sem bibliotecas): quem grava emite, quem mostra ouve.
//   - "dadosMudaram": gravou-se algo fora do ecrã que está aberto (o botão rápido "+", a fila offline
//     a enviar gastos): os ecrãs com saldos e gastos voltam a carregar.
//   - "abrirGastoRapido": abrir a folha "Novo gasto" (ex.: para editar um gasto que ficou por enviar).
//
// Num ecrã, ouvir só enquanto está à frente (ao voltar, o useFocusEffect já carrega tudo):
//   useFocusEffect(useCallback(() => {
//     carregarDados();
//     return ouvir('dadosMudaram', () => carregarDados());
//   }, [user]));

export interface Eventos {
  dadosMudaram: undefined;
  abrirGastoRapido: { idPendente?: string } | undefined;
}

type Ouvinte<K extends keyof Eventos> = (dados: Eventos[K]) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ouvintes = new Map<keyof Eventos, Set<(dados: any) => void>>();

/** Começa a ouvir. Devolve a função para deixar de ouvir (serve de limpeza num useEffect/useFocusEffect). */
export function ouvir<K extends keyof Eventos>(nome: K, ouvinte: Ouvinte<K>): () => void {
  let lista = ouvintes.get(nome);
  if (!lista) ouvintes.set(nome, (lista = new Set()));
  lista.add(ouvinte);
  return () => {
    lista!.delete(ouvinte);
  };
}

export function emitir<K extends keyof Eventos>(nome: K, ...dados: Eventos[K] extends undefined ? [Eventos[K]?] : [Eventos[K]]): void {
  const lista = ouvintes.get(nome);
  // Uma cópia: um ouvinte pode deixar de ouvir enquanto se avisa
  [...(lista ?? [])].forEach((ouvinte) => {
    try {
      ouvinte(dados[0] as Eventos[K]);
    } catch (erro) {
      console.error(`Erro num ouvinte de "${nome}":`, erro);
    }
  });
}
