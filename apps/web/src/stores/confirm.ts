import { create } from 'zustand';

/**
 * 1.0.0-G. One way to ask "are you sure?" across the game: a real dialog (big
 * buttons, readable on a phone, says exactly what will happen) instead of the
 * browser's `window.confirm`, which looks different everywhere and cannot be styled.
 *
 *   if (!(await confirmAction({ title: 'Choose Armory?', body: '...', confirmLabel: 'Choose Armory' }))) return;
 */
export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for anything that cannot be undone: red confirm, and focus starts on Cancel. */
  tone?: 'danger' | 'normal';
}

interface ConfirmState {
  pending: (ConfirmOptions & { resolve: (answer: boolean) => void }) | null;
  ask: (options: ConfirmOptions) => Promise<boolean>;
  answer: (answer: boolean) => void;
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  pending: null,
  ask(options) {
    // A second question while one is open cancels the first.
    get().pending?.resolve(false);
    return new Promise<boolean>((resolve) => set({ pending: { ...options, resolve } }));
  },
  answer(answer) {
    const pending = get().pending;
    set({ pending: null });
    pending?.resolve(answer);
  },
}));

export const confirmAction = (options: ConfirmOptions): Promise<boolean> => useConfirm.getState().ask(options);
