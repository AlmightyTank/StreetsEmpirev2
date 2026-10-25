import { NavLink } from 'react-router-dom';
import type { StoreDto } from '@streets/shared';

const TAB_NAMES: Record<string, string> = { CORNER: 'Corner', TOMMY: 'Tommy’s', CHARLIE: 'Charlie’s', PIP: 'Pip’s' };

/** The shop strip for trader stores. The player market has its own game navigation destination. */
export function StoreTabs({ stores, slug, board = false }: { stores: readonly Pick<StoreDto, 'key' | 'slug' | 'name'>[]; slug: string; board?: boolean }) {
  const tabCount = stores.length + (board ? 1 : 0);
  const compactFour = tabCount === 4;

  return (
    <nav className={`se-storetabs${compactFour ? ' se-storetabs--four' : ''}`} aria-label="Stores">
      {stores.map((store) => (
        <NavLink key={store.slug} to={`/game/stores/${store.slug}`} replace
          className={`se-storetabs__tab${store.slug === slug ? ' se-storetabs__tab--active' : ''}`}>
          {TAB_NAMES[store.key] ?? store.name}
        </NavLink>
      ))}
      {board ? (
        <NavLink to="/game/stores/board" replace
          className={`se-storetabs__tab${slug === 'board' ? ' se-storetabs__tab--active' : ''}`}>
          The Board
        </NavLink>
      ) : null}
    </nav>
  );
}
