import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { GruposDB, type GrupoDto } from '../services/grupos';
import { PartilhadoDB, type ResumoPartilhadoDto } from '../services/partilhado';

// Os grupos do utilizador e o resumo da parte partilhada (saldos, mealheiros, convites), para o menu,
// o Início e as Definições. Os ecrãs que mudam grupos chamam recarregar() no fim.

/** Um mealheiro na lista curta das Definições. */
export type MealheiroResumido = { id: string; grupoId: string; nome: string; saldo: number };

interface GruposContextType {
  grupos: GrupoDto[];
  /** Os mealheiros de todos os grupos (vêm do resumo). */
  poupancasPartilhadas: MealheiroResumido[];
  temGrupoOuPoupanca: boolean;
  resumo: ResumoPartilhadoDto | null;
  convitesPendentes: number;
  recarregar: () => Promise<void>;
  isLoading: boolean;
}

const GruposContext = createContext<GruposContextType | undefined>(undefined);

export function GruposProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [grupos, setGrupos] = useState<GrupoDto[]>([]);
  const [resumo, setResumo] = useState<ResumoPartilhadoDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!isAuthenticated || !user?.id) {
      setGrupos([]);
      setResumo(null);
      setIsLoading(false);
      return;
    }
    try {
      const [grps, res] = await Promise.all([GruposDB.listar(), PartilhadoDB.resumo()]);
      setGrupos(grps);
      setResumo(res);
    } catch (error) {
      // Mantém o que já havia: uma falha de rede não faz desaparecer os grupos do menu
      console.error('Erro ao carregar grupos:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const poupancasPartilhadas: MealheiroResumido[] = (resumo?.mealheiros ?? []).map((m) => ({
    id: m.id,
    grupoId: m.grupoId,
    nome: m.nome,
    saldo: m.saldo,
  }));

  return (
    <GruposContext.Provider
      value={{
        grupos,
        poupancasPartilhadas,
        temGrupoOuPoupanca: grupos.length > 0,
        resumo,
        convitesPendentes: resumo?.convitesPendentes ?? 0,
        recarregar: carregar,
        isLoading,
      }}
    >
      {children}
    </GruposContext.Provider>
  );
}

export function useGrupos() {
  const context = useContext(GruposContext);
  if (!context) {
    throw new Error('useGrupos deve ser usado dentro de GruposProvider');
  }
  return context;
}
