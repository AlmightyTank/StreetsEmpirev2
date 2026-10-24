import { NavLink } from 'react-router-dom';
import type { StoreDto } from '@streets/shared';

const TAB_NAMES: Record<string, string> = { CORNER: 'Corner', TOMMY: 'Tommy’s', CHARLIE: 'Charlie’s', PIP: 'Pip’s' };

/** The shop strip: every ruleset store, then the Salvage Yard for hideout parts. */
export function StoreTabs({ stores, slug }: { stores: readonly Pick<StoreDto, 'key' | 'slug' | 'name'>[]; slug: string }) {
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
    </nav>
  );
}
