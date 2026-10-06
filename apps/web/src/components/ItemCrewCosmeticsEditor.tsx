import type {
  AccountProfileSettingsDto,
  CosmeticOptionDto,
  CrewCosmeticKey,
  CustomizableItemKey,
  ItemCosmeticStyleKey,
} from '@streets/shared';
import { CREW_COSMETIC_KEYS, DEFAULT_CREW_COSMETICS, ITEM_COSMETIC_GROUPS } from '@streets/shared';
import { ITEM_ART } from '../items/itemArt.js';
import { ItemTile } from './ItemTile.js';

function StylePicker({
  value,
  styles,
  onChange,
  id,
}: {
  value: ItemCosmeticStyleKey;
  styles: readonly CosmeticOptionDto[];
  onChange: (style: ItemCosmeticStyleKey) => void;
  id: string;
}) {
  return (
    <select
      id={id}
      className="se-input"
      value={value}
      onChange={(event) => onChange(event.target.value as ItemCosmeticStyleKey)}
    >
      {styles.map((style) => (
        <option key={style.key} value={style.key}>{style.label}</option>
      ))}
    </select>
  );
}

/**
 * Weapons, the Low-Rider (Slice A), products and supplies (Slice B) and crew
 * outfits (Slice C) each pick an authored collection.
 */
export function ItemCrewCosmeticsEditor({
  settings,
  styles,
  crewStyles,
  onChange,
}: {
  settings: AccountProfileSettingsDto;
  styles: readonly CosmeticOptionDto[];
  crewStyles: readonly CosmeticOptionDto[];
  onChange: (settings: AccountProfileSettingsDto) => void;
}) {
  function setItemStyle(key: CustomizableItemKey, style: ItemCosmeticStyleKey) {
    onChange({
      ...settings,
      itemCosmetics: {
        ...(settings.itemCosmetics ?? {}),
        [key]: style,
      },
    });
  }

  function setCrewStyle(key: CrewCosmeticKey, style: ItemCosmeticStyleKey) {
    onChange({
      ...settings,
      crewCosmetics: {
        ...(settings.crewCosmetics ?? DEFAULT_CREW_COSMETICS),
        [key]: style,
      },
    });
  }

  return (
    <section className="se-cosmetic-locker" aria-labelledby="item-cosmetic-locker-title">
      <div className="se-cosmetic-locker__head">
        <div>
          <p className="se-eyebrow">Personal loadout</p>
          <h3 id="item-cosmetic-locker-title">Item cosmetics</h3>
        </div>
        <p className="se-hint">
          Each non-classic choice uses its own authored drawing. No color-filter skins. Cosmetics never change combat, prices, rarity or stats.
        </p>
      </div>

      {ITEM_COSMETIC_GROUPS.map((group) => (
        <div className="se-cosmetic-locker__group" key={group.key}>
          <h4>{group.label}</h4>
          <div className="se-cosmetic-locker__grid">
            {group.items.map((key) => {
              const style = settings.itemCosmetics?.[key] ?? 'classic';
              return (
                <div className="se-cosmetic-locker__card" key={key}>
                  <div className="se-cosmetic-locker__preview">
                    <ItemTile item={key} size="lg" cosmeticStyle={style} />
                  </div>
                  <label className="se-label" htmlFor={`item-cosmetic-${key.toLowerCase()}`}>{ITEM_ART[key].name}</label>
                  <StylePicker
                    id={`item-cosmetic-${key.toLowerCase()}`}
                    value={style}
                    styles={styles}
                    onChange={(next) => setItemStyle(key, next)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="se-cosmetic-locker__group">
        <h4>Crew outfits</h4>
        <div className="se-cosmetic-locker__grid">
          {CREW_COSMETIC_KEYS.map((key) => {
            const style = settings.crewCosmetics?.[key] ?? 'classic';
            return (
              <div className="se-cosmetic-locker__card" key={key}>
                <div className="se-cosmetic-locker__preview">
                  <ItemTile item={key} size="lg" cosmeticStyle={style} />
                </div>
                <label className="se-label" htmlFor={`crew-cosmetic-${key.toLowerCase()}`}>{ITEM_ART[key].name}</label>
                <StylePicker
                  id={`crew-cosmetic-${key.toLowerCase()}`}
                  value={style}
                  styles={crewStyles}
                  onChange={(next) => setCrewStyle(key, next)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
