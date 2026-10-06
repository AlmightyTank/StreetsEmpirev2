import type { ProfileLookDto } from '@streets/shared';
import { CREW_COSMETIC_KEYS, ITEM_COSMETIC_GROUPS } from '@streets/shared';
import { hasItemArt } from '../items/itemArt.js';
import { ItemTile } from './ItemTile.js';

/** True when there is something worth showing: a non-classic pick or an earned collection. */
export function hasProfileLook(look: ProfileLookDto | null | undefined): look is ProfileLookDto {
  if (!look) return false;
  return look.collections.length > 0
    || Object.values(look.items).some((style) => style && style !== 'classic')
    || Object.values(look.crew).some((style) => style !== 'classic');
}

/**
 * Slice E: a player's item and crew look on their public profile. Art only:
 * every item type in the owner's chosen collection, never counts, so it shows
 * style without leaking the inventory that recon protects.
 */
export function ProfileLook({ look, isYou }: { look: ProfileLookDto; isYou: boolean }) {
  return (
    <section className="se-profile-section se-profile-look" aria-labelledby="profile-look-title">
      <div className="se-profile-sectionhead">
        <div>
          <span className="se-eyebrow">Cosmetics</span>
          <h2 id="profile-look-title">The look</h2>
        </div>
        <span className="se-profile-sectionhead__meta">{isYou ? 'What visitors see · art only, never counts' : 'Art only · never counts'}</span>
      </div>

      {look.collections.length > 0 && (
        <div className="se-profile-look__collections">
          <span className="se-profile-look__label">Collections earned</span>
          <div className="se-profile-look__tiles">
            {look.collections.map((collection) => (hasItemArt(collection.key)
              ? <ItemTile key={collection.key} item={collection.key} size="sm" label={false} title={collection.title} />
              : <span key={collection.key} className="se-chip">{collection.title}</span>))}
          </div>
        </div>
      )}

      <div className="se-profile-look__groups">
        {ITEM_COSMETIC_GROUPS.map((group) => (
          <div className="se-profile-look__group" key={group.key}>
            <span className="se-profile-look__label">{group.label}</span>
            <div className="se-profile-look__tiles">
              {group.items.map((key) => (
                <ItemTile key={key} item={key} cosmeticStyle={look.items[key] ?? 'classic'} />
              ))}
            </div>
          </div>
        ))}
        <div className="se-profile-look__group">
          <span className="se-profile-look__label">Crew</span>
          <div className="se-profile-look__tiles">
            {CREW_COSMETIC_KEYS.map((key) => (
              <ItemTile key={key} item={key} cosmeticStyle={look.crew[key]} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
