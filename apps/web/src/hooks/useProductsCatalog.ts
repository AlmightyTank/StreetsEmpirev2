import { useCallback, useEffect, useState } from 'react';
import type { ProductsDto } from '@streets/shared';
import { api } from '../api/client.js';

/**
 * The round's products with this player's stock and permissions. Quest Recipe Unlocks D: a
 * claimed job can open a recipe or a shelf, so the catalog reloads whenever a job changes
 * (`streets:quests-changed`) and when the tab comes back into view, without a page reload.
 */
export function useProductsCatalog(): { catalog: ProductsDto | null; reload: () => void } {
  const [catalog, setCatalog] = useState<ProductsDto | null>(null);
  const reload = useCallback(() => {
    api.get<ProductsDto>('/game/products').then(setCatalog).catch(() => setCatalog(null));
  }, []);

  useEffect(() => {
    reload();
    const visible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    window.addEventListener('streets:quests-changed', reload);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('streets:quests-changed', reload);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [reload]);

  return { catalog, reload };
}
