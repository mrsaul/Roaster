import { useState, useEffect, useCallback, useRef } from "react";

export interface ProductDraftState {
  imageUrl: string;
  tags: string[];
  tastingNotes: string;
  isActive: boolean;
  process: string;
  origin: string;
  dataSourceMode: "sellsy" | "custom";
  customName: string;
  customPrice: string;
  savedAt: number;
}

const DRAFT_PREFIX = "product_edit_";

function getDraftKey(productId: string) {
  return `${DRAFT_PREFIX}${productId}`;
}

export function loadDraft(productId: string): ProductDraftState | null {
  try {
    const raw = localStorage.getItem(getDraftKey(productId));
    if (!raw) return null;
    return JSON.parse(raw) as ProductDraftState;
  } catch {
    return null;
  }
}

export function saveDraft(productId: string, state: ProductDraftState) {
  try {
    localStorage.setItem(getDraftKey(productId), JSON.stringify(state));
  } catch {
    // storage full — ignore
  }
}

export function clearDraft(productId: string) {
  localStorage.removeItem(getDraftKey(productId));
}

export function useProductDraft(productId: string | undefined) {
  const [hasDraft, setHasDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const persistDraft = useCallback(
    (state: Omit<ProductDraftState, "savedAt">) => {
      if (!productId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const now = Date.now();
        saveDraft(productId, { ...state, savedAt: now });
        setHasDraft(true);
        setLastSavedAt(now);
      }, 500);
    },
    [productId]
  );

  const removeDraft = useCallback(() => {
    if (!productId) return;
    clearDraft(productId);
    setHasDraft(false);
    setLastSavedAt(null);
  }, [productId]);

  const restoreDraft = useCallback((): ProductDraftState | null => {
    if (!productId) return null;
    const draft = loadDraft(productId);
    if (draft) {
      setHasDraft(true);
      setLastSavedAt(draft.savedAt);
    }
    return draft;
  }, [productId]);

  useEffect(() => {
    if (productId) {
      const draft = loadDraft(productId);
      setHasDraft(!!draft);
      setLastSavedAt(draft?.savedAt ?? null);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [productId]);

  return { hasDraft, lastSavedAt, persistDraft, removeDraft, restoreDraft };
}
