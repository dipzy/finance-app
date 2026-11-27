import type { NomeIcone } from '../components/ui/tipos';
import { t } from '../i18n';
import { acentosCategorias } from '../constants/tema';
import type { Categoria } from '../services/tipos';

// As categorias das gastos do dia a dia como a app as mostra: nome, ícone (Ionicons) e cor.
// As chaves são as da API (Financas.Services.Regras.Categorias) e não mudam: ficam guardadas.
// As despesas antigas, sem categoria, aparecem (e contam) como "Outros", tal como na API.

export interface InfoCategoria {
  chave: Categoria;
  nome: string;
  icone: NomeIcone;
  cor: string;
}

// O Record obriga a ter todas as categorias do tipo Categoria (e só essas)
const INFO: Record<Categoria, Omit<InfoCategoria, 'chave' | 'cor'>> = {
  supermercado: { nome: 'Supermercado', icone: 'cart-outline' },
  restauracao: { nome: 'Restauração', icone: 'restaurant-outline' },
  transportes: { nome: 'Transportes', icone: 'bus-outline' },
  carro: { nome: 'Carro', icone: 'car-outline' },
  combustivel: { nome: 'Combustível', icone: 'speedometer-outline' },
  casa: { nome: 'Casa', icone: 'home-outline' },
  telecomunicacoes: { nome: 'Telecomunicações', icone: 'cellular-outline' },
  saude: { nome: 'Saúde', icone: 'medkit-outline' },
  lazer: { nome: 'Lazer', icone: 'game-controller-outline' },
  compras: { nome: 'Compras', icone: 'bag-handle-outline' },
  educacao: { nome: 'Educação', icone: 'school-outline' },
  viagens: { nome: 'Viagens', icone: 'airplane-outline' },
  presentes: { nome: 'Presentes', icone: 'gift-outline' },
  outros: { nome: 'Outros', icone: 'pricetag-outline' },
};

// Pela ordem em que aparecem nos seletores (a mesma da API); "outros" fica no fim
export const CATEGORIAS: InfoCategoria[] = (Object.keys(INFO) as Categoria[]).map((chave) => ({
  chave,
  ...INFO[chave],
  cor: acentosCategorias[chave],
}));

const PORCHAVE = new Map(CATEGORIAS.map((c) => [c.chave, c]));

export const eCategoria = (valor: unknown): valor is Categoria => typeof valor === 'string' && PORCHAVE.has(valor as Categoria);

// A categoria com que uma despesa conta: sem categoria (ou uma desconhecida) é "outros"
export const categoriaDe = (chave: string | null | undefined): Categoria => (eCategoria(chave) ? chave : 'outros');

export const infoCategoria = (chave: string | null | undefined): InfoCategoria => PORCHAVE.get(categoriaDe(chave))!;

// O nome que o utilizador vê, já no idioma atual (o 'nome' serve de chave do dicionário);
// o Excel importado/exportado continua a usar infoCategoria(chave).nome (sempre em português)
export const nomeCategoria = (chave: string | null | undefined): string => t(infoCategoria(chave).nome);
