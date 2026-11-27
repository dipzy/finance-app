import type { NomeIcone } from '../components/ui/tipos';
import { acentosFolha, cores } from './tema';

// Como se reconhece cada saldo em toda a app (cabeçalho, menu, Início, "Pagar com", listas, simulador):
// a conta é azul com a carteira; o cartão de alimentação é laranja com o cesto. O verde fica só para o
// "dinheiro que entra" e o "card-outline" para os cartões de crédito das dívidas. Os talheres
// ("restaurant-outline") são da categoria Restauração: não servem de ícone do cartão.
export const COR_CONTA = acentosFolha.conta;
export const COR_CARTAO = cores.laranja;

export const ICONE_CONTA: NomeIcone = 'wallet-outline';
export const ICONE_CARTAO: NomeIcone = 'basket-outline';
