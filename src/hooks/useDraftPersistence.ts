import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

type StoredDraft<T> = {
  data: T;
  savedAt: string; // ISO 8601
};

export interface DraftPersistenceResult<T> {
  /** Current form value */
  value: T;
  /**
   * Drop-in replacement for useState's setter.
   * Supports both direct values and functional updaters.
   * Schedules a debounced 500ms localStorage save and dismisses the banner.
   */
  setValue: Dispatch<SetStateAction<T>>;
  /**
   * Wipes the localStorage key. Call this on successful form submission.
   * Does NOT reset the form value.
   */
  clearDraft: () => void;
  /**
   * Wipes the localStorage key AND resets the form value back to defaultValue.
   * Call this when the user clicks "Discard" in the DraftBanner.
   */
  discardDraft: () => void;
  /**
   * Immediately flushes any pending debounced save to localStorage.
   * Call this on visibilitychange (tab hide) to guarantee nothing is lost.
   */
  flushDraft: () => void;
  /** ISO string of when the draft was last written, or null if no draft exists. */
  savedAt: string | null;
  /**
   * True only when a draft was loaded from storage AND the user hasn't started
   * editing yet (i.e. the DraftBanner should be visible).
   */
  showBanner: boolean;
}

// ─── Module-level userId cache ────────────────────────────────────────────────
// Caching the userId at module scope means that after the very first
// getSession() resolves (on app load), all subsequent formKey changes can
// rebuild the storage key *synchronously* — eliminating the "reset then load"
// flash that the async version produces.

let _cachedUid: string | null = null;

async function resolveUid(): Promise<string> {
  if (_cachedUid !== null) return _cachedUid;
  const { data: { session } } = await supabase.auth.getSession();
  _cachedUid = session?.user?.id ?? "__anon__";
  return _cachedUid;
}

/** Returns the cached userId synchronously, or null if not yet resolved. */
export function getCachedUid(): string | null {
  return _cachedUid;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useDraftPersistence<T>
 *
 * A single, consistent hook for persisting form drafts to localStorage.
 *
 * Storage key format: `draft:{formKey}:{userId}`
 * This ensures drafts are per-user, never shared across accounts.
 *
 * Supports dynamic formKeys (e.g. edit dialogs that include a record ID).
 * When formKey changes, the hook re-initializes automatically.
 *
 * @param formKey      Stable identifier for this form, e.g. "onboarding" or
 *                     "admin-client-edit:${client.id}". May be dynamic.
 * @param defaultValue The "blank" form state used when no draft exists and on discard.
 *                     Updated synchronously on every render, so dynamic objects work.
 */
export function useDraftPersistence<T>(
  formKey: string,
  defaultValue: T,
): DraftPersistenceResult<T> {
  // Always keep a ref to the latest defaultValue so effects can read it
  // without stale closure issues.
  const defaultValueRef = useRef<T>(defaultValue);
  defaultValueRef.current = defaultValue; // synchronous update on every render

  const [value, setRawValue] = useState<T>(defaultValue);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  const storageKeyRef = useRef<string | null>(null);
  const valueRef = useRef<T>(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep valueRef in sync so the debounced save captures the latest value
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // ── 1. Re-initialize whenever formKey changes ──────────────────────────────
  // This runs on mount AND whenever the key changes (e.g. switching between
  // products in an edit dialog).
  //
  // KEY IMPROVEMENT: if the userId is already cached from a previous run,
  // we resolve the storage key and load the draft synchronously — no flash
  // of DB/default values before the draft appears.
  useEffect(() => {
    let cancelled = false;

    // Cancel any in-flight debounced save from the previous key
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    // Clear storage key so that any setValue calls during key resolution
    // don't accidentally write to the old or wrong key.
    storageKeyRef.current = null;

    const tryLoadFromStorage = (uid: string) => {
      const key = `draft:${formKey}:${uid}`;
      storageKeyRef.current = key;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed: StoredDraft<T> = JSON.parse(raw);
          if (parsed?.data !== undefined && parsed?.savedAt) {
            return parsed;
          }
        }
      } catch {
        // Corrupted storage — fall through to default
      }
      return null;
    };

    const cachedUid = _cachedUid;

    if (cachedUid !== null) {
      // Fast path — synchronous, no flicker
      const draft = tryLoadFromStorage(cachedUid);
      if (draft) {
        setRawValue(draft.data);
        valueRef.current = draft.data;
        setSavedAt(draft.savedAt);
        setShowBanner(true);
      } else {
        setRawValue(defaultValueRef.current);
        valueRef.current = defaultValueRef.current;
        setSavedAt(null);
        setShowBanner(false);
      }
    } else {
      // Slow path — first load, must await getSession()
      // Reset optimistically while we wait for the userId
      setRawValue(defaultValueRef.current);
      valueRef.current = defaultValueRef.current;
      setSavedAt(null);
      setShowBanner(false);

      resolveUid().then((uid) => {
        if (cancelled) return;
        const draft = tryLoadFromStorage(uid);
        if (draft) {
          setRawValue(draft.data);
          valueRef.current = draft.data;
          setSavedAt(draft.savedAt);
          setShowBanner(true);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [formKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: defaultValue intentionally omitted — it's read via ref to avoid
  // re-initializing the form every render when the default is a new object.

  // ── 2. setValue: update state + schedule save + dismiss banner ─────────────
  const setValue: Dispatch<SetStateAction<T>> = useCallback((action) => {
    setRawValue((prev) => {
      const next =
        typeof action === "function"
          ? (action as (prevState: T) => T)(prev)
          : action;
      valueRef.current = next;
      return next;
    });

    // Dismiss the banner the moment the user makes any edit
    setShowBanner(false);

    // Debounced write to localStorage
    if (storageKeyRef.current) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!storageKeyRef.current) return;
        try {
          const now = new Date().toISOString();
          const draft: StoredDraft<T> = { data: valueRef.current, savedAt: now };
          localStorage.setItem(storageKeyRef.current, JSON.stringify(draft));
          setSavedAt(now);
        } catch {
          // Storage quota exceeded or unavailable — ignore
        }
      }, 500);
    }
  }, []); // stable — all state interactions are via refs or stable React setter refs

  // ── 3. flushDraft: save immediately (call on visibilitychange hidden) ───────
  const flushDraft = useCallback(() => {
    if (!storageKeyRef.current) return;
    // Cancel the pending debounce and write immediately
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    try {
      const now = new Date().toISOString();
      const draft: StoredDraft<T> = { data: valueRef.current, savedAt: now };
      localStorage.setItem(storageKeyRef.current, JSON.stringify(draft));
      setSavedAt(now);
    } catch {
      // Storage quota exceeded or unavailable — ignore
    }
  }, []);

  // ── 4. clearDraft: remove from storage (call on successful submit) ─────────
  const clearDraft = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (storageKeyRef.current) {
      localStorage.removeItem(storageKeyRef.current);
    }
    setSavedAt(null);
    setShowBanner(false);
  }, []);

  // ── 5. discardDraft: remove from storage + reset form (call on "Discard") ──
  const discardDraft = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (storageKeyRef.current) {
      localStorage.removeItem(storageKeyRef.current);
    }
    setSavedAt(null);
    setShowBanner(false);
    // Use raw setState to bypass the save-scheduling setValue
    const resetVal = defaultValueRef.current;
    setRawValue(resetVal);
    valueRef.current = resetVal;
  }, []);

  // ── 6. Cleanup on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { value, setValue, clearDraft, discardDraft, flushDraft, savedAt, showBanner };
}
