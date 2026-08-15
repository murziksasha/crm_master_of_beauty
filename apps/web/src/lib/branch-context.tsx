'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type Branch = {
  id: string;
  name: string;
  slug: string;
  address?: string | null;
  phone?: string | null;
  isDefault?: boolean;
  isActive?: boolean;
};

type BranchContextValue = {
  branches: Branch[];
  branchId: string | null;
  branch: Branch | null;
  setBranchId: (id: string) => void;
  loading: boolean;
};

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('branchId');
    api<Branch[]>('/branches')
      .then((list) => {
        setBranches(list);
        const preferred =
          list.find((b) => b.id === stored)?.id ||
          list.find((b) => b.isDefault)?.id ||
          list[0]?.id ||
          null;
        setBranchIdState(preferred);
        if (preferred) localStorage.setItem('branchId', preferred);
      })
      .catch(() => setBranches([]))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<BranchContextValue>(
    () => ({
      branches,
      branchId,
      branch: branches.find((b) => b.id === branchId) || null,
      setBranchId(id: string) {
        setBranchIdState(id);
        localStorage.setItem('branchId', id);
        // refresh branch-scoped data
        void qc.invalidateQueries();
      },
      loading,
    }),
    [branches, branchId, loading, qc],
  );

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch outside provider');
  return ctx;
}
