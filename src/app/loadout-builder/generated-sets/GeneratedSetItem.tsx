import { D2ManifestDefinitions } from 'app/destiny2/d2-definitions';
import { t } from 'app/i18next-t';
import { showItemPicker } from 'app/item-picker/item-picker';
import ItemSockets from 'app/item-popup/ItemSockets';
import { AppIcon, faRandom, lockIcon } from 'app/shell/icons';
import { DestinyInventoryItemDefinition } from 'bungie-api-ts/destiny2';
import React, { Dispatch, useMemo } from 'react';
import { DimItem, PluggableInventoryItemDefinition } from '../../inventory/item-types';
import LoadoutBuilderItem from '../LoadoutBuilderItem';
import { LoadoutBuilderAction } from '../loadoutBuilderReducer';
import { matchLockedItem } from '../preProcessFilter';
import {
  LockedArmor2Mod,
  LockedItemType,
  ModPickerCategories,
  ModPickerCategory,
  StatTypes,
} from '../types';
import { armor2ModPlugCategoriesTitles, generateMixesFromPerks, lockedItemsEqual } from '../utils';
import styles from './GeneratedSetItem.m.scss';
import Sockets from './Sockets';

/**
 * An individual item in a generated set. Includes a perk display and a button for selecting
 * alternative items with the same stat mix.
 */
export default function GeneratedSetItem({
  item,
  locked,
  defs,
  statValues,
  itemOptions,
  statOrder,
  lockedMods,
  lbDispatch,
}: {
  item: DimItem;
  locked?: readonly LockedItemType[];
  defs: D2ManifestDefinitions;
  statValues: number[];
  itemOptions: DimItem[];
  statOrder: StatTypes[];
  lockedMods: LockedArmor2Mod[];
  lbDispatch: Dispatch<LoadoutBuilderAction>;
}) {
  const altPerks = useMemo(() => generateMixesFromPerks(item, statValues, statOrder), [
    item,
    statValues,
    statOrder,
  ]);

  const addLockedItem = (item: LockedItemType) => lbDispatch({ type: 'addItemToLockedMap', item });
  const removeLockedItem = (item: LockedItemType) =>
    lbDispatch({ type: 'removeItemFromLockedMap', item });

  const classesByHash = altPerks.reduce(
    (memo, perk) => ({ ...memo, [perk.plugDef.hash]: styles.altPerk }),
    {}
  );
  if (locked) {
    for (const lockedItem of locked) {
      if (lockedItem.type === 'perk') {
        classesByHash[lockedItem.perk.hash] = styles.selectedPerk;
      }
    }
  }

  const chooseReplacement = async () => {
    const ids = new Set(itemOptions.map((i) => i.id));

    try {
      const { item } = await showItemPicker({
        prompt: t('LoadoutBuilder.ChooseAlternate'),
        filterItems: (item: DimItem) => ids.has(item.id),
      });

      addLockedItem({ type: 'item', item, bucket: item.bucket });
    } catch (e) {}
  };

  const onShiftClick = (lockedItem: LockedItemType) => {
    locked?.some((li) => lockedItemsEqual(lockedItem, li))
      ? removeLockedItem(lockedItem)
      : addLockedItem(lockedItem);
  };

  const lockedPerks: DestinyInventoryItemDefinition[] = [];
  /*  TODO: atm I just have all mods here but this will move to only old ones
      when we get closer to releasing as perk picker will only have old mods */
  const lockedOldMods: DestinyInventoryItemDefinition[] = [];

  if ($featureFlags.armor2ModPicker && locked?.length) {
    for (const lockedItem of locked) {
      if (lockedItem.type === 'perk' && matchLockedItem(item, lockedItem)) {
        lockedPerks.push(lockedItem.perk);
      } else if (lockedItem.type === 'mod' && matchLockedItem(item, lockedItem)) {
        lockedOldMods.push(lockedItem.mod);
      }
    }
  }

  const onSocketClick = (
    plugDef: PluggableInventoryItemDefinition,
    category?: ModPickerCategory,
    season?: number
  ) => {
    if (category) {
      const initialQuery =
        category === ModPickerCategories.seasonal
          ? season?.toString()
          : t(armor2ModPlugCategoriesTitles[category]);
      lbDispatch({ type: 'openModPicker', initialQuery });
    } else {
      lbDispatch({ type: 'openPerkPicker', initialQuery: plugDef.displayProperties.name });
    }
  };

  return (
    <div className={styles.item}>
      <LoadoutBuilderItem item={item} locked={locked} addLockedItem={addLockedItem} />

      {itemOptions.length > 1 ? (
        <button
          type="button"
          className={styles.swapButton}
          title={t('LoadoutBuilder.ChooseAlternateTitle')}
          onClick={chooseReplacement}
        >
          <AppIcon icon={faRandom} />
        </button>
      ) : (
        locked?.some((li) => li.type === 'item') && (
          <button
            type="button"
            className={styles.swapButton}
            title={t('LoadoutBuilder.UnlockItem')}
            onClick={() => removeLockedItem({ type: 'item', item, bucket: item.bucket })}
          >
            <AppIcon icon={lockIcon} />
          </button>
        )
      )}
      {!$featureFlags.armor2ModPicker && item.isDestiny2() && (
        <ItemSockets
          item={item}
          minimal={true}
          classesByHash={classesByHash}
          onShiftClick={onShiftClick}
        />
      )}
      {$featureFlags.armor2ModPicker && (
        <div className={styles.lockedSockets}>
          <Sockets item={item} lockedMods={lockedMods} defs={defs} onSocketClick={onSocketClick} />
        </div>
      )}
    </div>
  );
}
