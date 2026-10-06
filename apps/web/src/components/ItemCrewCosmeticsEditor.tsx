import type {
  AccountProfileSettingsDto,
  CosmeticOptionDto,
  CrewCosmeticKey,
  CustomizableItemKey,
  ItemCosmeticStyleKey,
} from '@streets/shared';
import { CUSTOMIZABLE_ITEM_KEYS, DEFAULT_CREW_COSMETICS } from '@streets/shared';
import { ITEM_ART } from '../items/itemArt.js';
import { ItemTile } from './ItemTile.js';

const crewChoices: ReadonlyArray<{ key: CrewCosmeticKey; label: string }> = [
  { key: 'THUG', label: 'Thugs' },
  { key: 'HOE', label: 'Hoes' },
];

const itemGroups = [
  {
    title: 'Weapons & rides',
    keys: CUSTOMIZABLE_ITEM_KEYS.filter((key) => ITEM_ART[key].category === 'WEAPON' || ITEM_ART[key].category === 'VEHICLE'),
  },
  {
    title: 'Supplies',
    keys: CUSTOMIZABLE_ITEM_KEYS.filter((key) => ITEM_ART[key].category === 'SUPPLY'),
  },
  {
    title: 'Products',
    keys: CUSTOMIZABLE_ITEM_KEYS.filter((key) => ITEM_ART[key].category === 'PRODUCT'),
  },
] as const;

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

export function ItemCrewCosmeticsEditor({
  settings,
  styles,
  onChange,
}: {
  settings: AccountProfileSettingsDto;
  styles: readonly CosmeticOptionDto[];
  onChange: (settings: AccountProfileSettingsDto) => void;
}) {
  function setCrewStyle(key: CrewCosmeticKey, style: ItemCosmeticStyleKey) {
    onChange({
      ...settings,
      crewCosmetics: {
        ...DEFAULT_CREW_COSMETICS,
        ...(settings.crewCosmetics ?? {}),
        [key]: style,
      },
    });
  }

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
          <p className="se-eyebrow">Personal loadout</p>
          <h3 id="item-cosmetic-locker-title">Item & crew cosmetics</h3>
        </div>
        <p className="se-hint">
          Pick a look for each item and your whole crew type. These are visual only and never change combat, prices, rarity or stats.
        </p>
      </div>

      <div className="se-cosmetic-locker__group">
        <h4>Crew</h4>
        <div className="se-cosmetic-locker__grid">
          {crewChoices.map(({ key, label }) => {
            const style = settings.crewCosmetics?.[key] ?? DEFAULT_CREW_COSMETICS[key];
            return (
              <div className="se-cosmetic-locker__card" key={key}>
                <div className="se-cosmetic-locker__preview">
                  <ItemTile item={key} size="lg" cosmeticStyle={style} />
                </div>
                <label className="se-label" htmlFor={`crew-cosmetic-${key.toLowerCase()}`}>{label}</label>
                <StylePicker
                  id={`crew-cosmetic-${key.toLowerCase()}`}
                  value={style}
                  styles={styles}
                  onChange={(next) => setCrewStyle(key, next)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {itemGroups.map((group) => (
        <div className="se-cosmetic-locker__group" key={group.title}>
          <h4>{group.title}</h4>
          <div className="se-cosmetic-locker__grid">
            {group.keys.map((key) => {
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
    </section>
  );
}
