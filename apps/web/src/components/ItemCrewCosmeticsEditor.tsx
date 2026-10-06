import type {
  AccountProfileSettingsDto,
  CosmeticOptionDto,
  CustomizableItemKey,
  ItemCosmeticStyleKey,
} from '@streets/shared';
import { CUSTOMIZABLE_ITEM_KEYS } from '@streets/shared';
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
 * Slice A exposes weapons and the Low-Rider only. Products/supplies keep their
 * authored Classic art until Slice B, and crew stays Classic until outfit Slice C.
 */
export function ItemCrewCosmeticsEditor({
  settings,
  styles,
  onChange,
}: {
  settings: AccountProfileSettingsDto;
  styles: readonly CosmeticOptionDto[];
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

  return (
    <section className="se-cosmetic-locker" aria-labelledby="item-cosmetic-locker-title">
      <div className="se-cosmetic-locker__head">
        <div>
          <p className="se-eyebrow">Personal loadout · Slice A</p>
          <h3 id="item-cosmetic-locker-title">Weapon & ride cosmetics</h3>
        </div>
        <p className="se-hint">
          Each non-classic choice uses its own authored drawing. No color-filter skins. Cosmetics never change combat, prices, rarity or stats.
        </p>
      </div>

      <div className="se-cosmetic-locker__group">
        <h4>Weapons & rides</h4>
        <div className="se-cosmetic-locker__grid">
          {CUSTOMIZABLE_ITEM_KEYS.map((key) => {
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

      <p className="se-hint se-cosmetic-locker__roadmap">
        Products and supplies get fully redrawn packaging in Slice B. Thugs and hoes get authored outfit sets in Slice C.
      </p>
    </section>
  );
}
