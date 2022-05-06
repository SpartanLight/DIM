import { DestinyAccount } from 'app/accounts/destiny-account';
import { t } from 'app/i18next-t';
import { DimItem } from 'app/inventory/item-types';
import { storesSelector } from 'app/inventory/selectors';
import { getCurrentStore } from 'app/inventory/stores-helpers';
import { warnMissingClass } from 'app/loadout-builder/loadout-builder-reducer';
import { useD2Definitions } from 'app/manifest/selectors';
import { showNotification } from 'app/notifications/notifications';
import { useEventBusListener } from 'app/utils/hooks';
import { DestinyClass } from 'bungie-api-ts/destiny2';
import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import { Loadout } from '../loadout/loadout-types';
import { addItem$, editLoadout$ } from './loadout-events';
import { generateMissingLoadoutItemId } from './loadout-item-conversion';
import { convertDimApiLoadoutToLoadout } from './loadout-type-converters';
import { newLoadout, pickBackingStore } from './loadout-utils';

const LoadoutDrawer = React.lazy(
  () => import(/* webpackChunkName: "loadout-drawer" */ './LoadoutDrawer2')
);
const D1LoadoutDrawer = React.lazy(
  () =>
    import(/* webpackChunkName: "d1-loadout-drawer" */ 'app/destiny1/loadout-drawer/LoadoutDrawer')
);

/**
 * A launcher for the LoadoutDrawer. This is used both so we can lazy-load the
 * LoadoutDrawer, and so we can make sure defs are defined when the loadout
 * drawer is rendered.
 */
export default function LoadoutDrawerContainer({ account }: { account: DestinyAccount }) {
  const defs = useD2Definitions();
  const navigate = useNavigate();
  const { search: queryString, pathname } = useLocation();

  // This state only holds the initial version of the loadout that launches the
  // drawer - after that, the loadout drawer itself manages edits to the
  // loadout.
  // TODO: Alternately we could come up with the concept of a
  // `useControlledReducer` that applied a reducer to mutate an object whose
  // state is handled outside the component.
  const [initialLoadout, setInitialLoadout] = useState<{
    loadout: Loadout;
    storeId: string;
    showClass: boolean;
    isNew: boolean;
  }>();

  const handleDrawerClose = useCallback(() => {
    setInitialLoadout(undefined);
  }, []);

  const stores = useSelector(storesSelector);

  // The loadout to edit comes in from the editLoadout$ observable
  useEventBusListener(
    editLoadout$,
    useCallback(
      ({ loadout, storeId, showClass, isNew }) => {
        // Fall back to current store because otherwise there's no way to delete loadouts
        // the user doesn't have a class for.
        const editingStore =
          pickBackingStore(stores, storeId, loadout.classType) ?? getCurrentStore(stores);

        if (!editingStore) {
          return;
        }

        setInitialLoadout({
          loadout,
          storeId: editingStore.id,
          showClass: Boolean(showClass),
          isNew: Boolean(isNew),
        });
      },
      [stores]
    )
  );

  const hasInitialLoadout = Boolean(initialLoadout);

  // Only react to add item if there's not a loadout open (otherwise it'll be handled in the loadout drawer!)
  useEventBusListener(
    addItem$,
    useCallback(
      (item: DimItem) => {
        if (!hasInitialLoadout) {
          // If we don't have a loadout, this action was invoked via the "+ Loadout" button
          // in item actions, so pick the best store to back this loadout with
          const owner = pickBackingStore(stores, item.owner, item.classType);

          if (!owner) {
            showNotification({
              type: 'warning',
              title: t('Loadouts.ClassTypeMissing', { className: item.classTypeNameLocalized }),
            });
            return;
          }

          const classType =
            item.classType === DestinyClass.Unknown ? owner.classType : item.classType;
          const draftLoadout = newLoadout('', [], classType);
          draftLoadout.items.push({
            id: item.id,
            hash: item.hash,
            equip: true,
            amount: item.amount ?? 1,
          });
          setInitialLoadout({
            loadout: draftLoadout,
            storeId: owner.id,
            isNew: true,
            showClass: true,
          });
        }
      },
      [hasInitialLoadout, stores]
    )
  );

  // Load in a full loadout specified in the URL
  useEffect(() => {
    if (!stores.length || !defs?.isDestiny2()) {
      return;
    }
    const searchParams = new URLSearchParams(queryString);
    const loadoutJSON = searchParams.get('loadout');
    if (loadoutJSON) {
      try {
        const parsedLoadout = convertDimApiLoadoutToLoadout(JSON.parse(loadoutJSON));
        if (parsedLoadout) {
          const storeId = pickBackingStore(stores, undefined, parsedLoadout.classType)?.id;

          if (!storeId) {
            warnMissingClass(parsedLoadout.classType, defs);
            return;
          }

          parsedLoadout.id = uuidv4();
          parsedLoadout.items = parsedLoadout.items.map((item) => ({
            ...item,
            id:
              item.id === '0'
                ? // We don't save consumables in D2 loadouts, but we may omit ids in shared loadouts
                  // (because they'll never match someone else's inventory). So
                  // instead, pick an ID.
                  generateMissingLoadoutItemId()
                : item.id,
          }));

          setInitialLoadout({
            loadout: parsedLoadout,
            storeId,
            isNew: true,
            showClass: false,
          });
        }
      } catch (e) {
        showNotification({
          type: 'error',
          title: t('Loadouts.BadLoadoutShare'),
          body: t('Loadouts.BadLoadoutShareBody', { error: e.message }),
        });
      }
      // Clear the loadout
      navigate(pathname, { replace: true });
    }
  }, [defs, queryString, navigate, pathname, stores]);

  // Close the loadout on navigation
  // TODO: prompt for saving?
  useEffect(() => {
    // Don't close if moving to the inventory or loadouts screen
    if (!pathname.endsWith('inventory') && !pathname.endsWith('loadouts')) {
      handleDrawerClose();
    }
  }, [handleDrawerClose, pathname]);

  if (initialLoadout) {
    return (
      <Suspense fallback={null}>
        {account.destinyVersion === 2 ? (
          <LoadoutDrawer
            initialLoadout={initialLoadout.loadout}
            storeId={initialLoadout.storeId}
            isNew={initialLoadout.isNew}
            onClose={handleDrawerClose}
          />
        ) : (
          <D1LoadoutDrawer
            initialLoadout={initialLoadout.loadout}
            storeId={initialLoadout.storeId}
            isNew={initialLoadout.isNew}
            showClass={initialLoadout.showClass}
            onClose={handleDrawerClose}
          />
        )}
      </Suspense>
    );
  }
  return null;
}
