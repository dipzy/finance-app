import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

// O idioma da app (todo o texto visível): português (o original) ou inglês.
// Fica guardado no dispositivo (AsyncStorage) com chave própria, à parte das definições, para os
// testes das definições não dependerem disto. Por defeito segue o idioma do telemóvel (pt/en);
// qualquer outro idioma, ou uma deteção sem resposta, fica em português.

export type Idioma = 'pt' | 'en';

const CHAVE = '@financas:idioma';

/** O idioma do telemóvel quando é pt ou en (senão 'pt'). Nos testes (jest) é sempre português. */
export function idiomaDoDispositivo(): Idioma {
  // Nos testes os ecrãs verificam o texto em português: aqui o idioma é fixo em pt
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') return 'pt';
  try {
    // Na web usa-se navigator.language; no telemóvel (Hermes) o Intl dá o idioma do sistema
    const codigo =
      (typeof navigator !== 'undefined' && navigator.language) ||
      Intl.DateTimeFormat().resolvedOptions().locale ||
      '';
    const base = codigo.toLowerCase();
    if (base.startsWith('pt')) return 'pt';
    if (base.startsWith('en')) return 'en';
    return 'pt';
  } catch {
    return 'pt';
  }
}

// ---- Estado partilhado: o seletor das Definições muda, todos os ecrãs ouvem ----

let atual: Idioma = idiomaDoDispositivo();
let aCarregar: Promise<Idioma> | null = null;
const ouvintes = new Set<(idioma: Idioma) => void>();

/** O idioma atual (síncrono). */
export function idiomaAtual(): Idioma {
  return atual;
}

/** Lê o idioma guardado no dispositivo. Devolve o idioma que passa a valer. */
export function obterIdioma(): Promise<Idioma> {
  if (!aCarregar) {
    aCarregar = AsyncStorage.getItem(CHAVE)
      .catch((error) => {
        console.error('Erro ao ler o idioma:', error);
        return null;
      })
      .then((guardado) => {
        if (guardado === 'pt' || guardado === 'en') atual = guardado;
        return atual;
      });
  }
  return aCarregar;
}

/** Muda o idioma: avisa já quem está a ouvir e guarda no dispositivo (se a gravação falhar, fica até fechar a app). */
export async function definirIdioma(idioma: Idioma): Promise<Idioma> {
  atual = idioma;
  ouvintes.forEach((ouvinte) => ouvinte(idioma));
  try {
    await AsyncStorage.setItem(CHAVE, idioma);
  } catch (error) {
    console.error('Erro ao gravar o idioma:', error);
  }
  return atual;
}

/** Avisa sempre que o idioma muda. Devolve a função para deixar de ouvir. */
export function aoMudarIdioma(ouvinte: (idioma: Idioma) => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** O idioma atual, sempre atualizado (os componentes com texto traduzido usam useT()). */
export function useIdioma(): Idioma {
  const [idioma, setIdioma] = useState<Idioma>(atual);
  useEffect(() => {
    let ativo = true;
    obterIdioma().then((i) => {
      if (ativo) setIdioma(i);
    });
    return aoMudarIdioma(setIdioma);
  }, []);
  return idioma;
}

// Só para os testes: voltar ao idioma do dispositivo e esquecer o que já foi lido
export function __reporIdioma() {
  atual = idiomaDoDispositivo();
  aCarregar = null;
  ouvintes.clear();
}