// A palavra que o utilizador escreve para confirmar que quer apagar a conta (a API exige exatamente esta,
// senão responde 400). Fica aqui, sem a API nem o Firebase, para o modal e os testes a usarem à vontade.
export const PALAVRA_APAGAR = 'APAGAR';

export const eConfirmacaoValida = (texto: string) => texto.trim() === PALAVRA_APAGAR;
