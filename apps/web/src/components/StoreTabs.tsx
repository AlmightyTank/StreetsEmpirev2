import { NavLink } from 'react-router-dom';
import type { StoreDto } from '@streets/shared';

const TAB_NAMES: Record<string, string> = { CORNER: 'Corner', TOMMY: 'Tommy’s', CHARLIE: 'Charlie’s', PIP: 'Pip’s' };

/**
 * The shop strip: every ruleset store, then the Salvage Yard for hideout parts, then the Board
 * on rounds that switched player listings on.
 */
export function StoreTabs({ stores, slug, board = false }: { stores: readonly Pick<StoreDto, 'key' | 'slug' | 'name'>[]; slug: string; board?: boolean }) {
  return (
    <nav className="se-storetabs" aria-label="Stores">
      {stores.map((store) => (
        <NavLink key={store.slug} to={`/game/stores/${store.slug}`} replace
          className={`se-storetabs__tab${store.slug === slug ? ' se-storetabs__tab--active' : ''}`}>
          {TAB_NAMES[store.key] ?? store.name}
        </NavLink>
      ))}
      <NavLink to="/game/stores/salvage" replace
        className={`se-storetabs__tab${slug === 'salvage' ? ' se-storetabs__tab--active' : ''}`}>
        Salvage Yard
      </NavLink>
      {board ? (
        <NavLink to="/game/stores/board" replace
          className={`se-storetabs__tab${slug === 'board' ? ' se-storetabs__tab--active' : ''}`}>
          The Board
        </NavLink>
      ) : null}
    </nav>
  );
}
