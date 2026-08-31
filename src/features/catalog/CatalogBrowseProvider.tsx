import { useNetworkState } from 'expo-network';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';

import type {
  StorefrontBootstrapService,
} from '../../lib/storefront-bootstrap-service.ts';
import {
  catalogFailureState,
  projectCatalogSnapshot,
  type CatalogBrowseContextValue,
  type CatalogBrowseState,
} from './catalog-browse.ts';
import {
  catalogBrowseReducer,
  shouldLoadCatalogBrowse,
  type CatalogNetworkState,
} from './catalog-browse-state.ts';

export type CatalogBrowseProviderProps = Readonly<{
  active?: boolean;
  children: ReactNode;
  createBootstrapService: () => StorefrontBootstrapService;
  networkStateOverride?: CatalogNetworkState;
}>;

const INITIAL_STATE: CatalogBrowseState = Object.freeze({ status: 'idle' });
const CatalogBrowseContext = createContext<CatalogBrowseContextValue | undefined>(
  undefined,
);

export function CatalogBrowseProvider({
  active = true,
  children,
  createBootstrapService,
  networkStateOverride,
}: CatalogBrowseProviderProps) {
  const detectedNetworkState = useNetworkState();
  const networkState = networkStateOverride ?? detectedNetworkState;
  const shouldLoad = shouldLoadCatalogBrowse(active, networkState);
  const [state, dispatch] = useReducer(catalogBrowseReducer, INITIAL_STATE);
  const [reloadVersion, requestReload] = useReducer((version: number) => version + 1, 0);
  const [selectedCategoryId, selectCategory] = useReducer(
    (_current: string | undefined, next: string | undefined) => next,
    undefined,
  );

  const load = useCallback(() => {
    requestReload();
  }, []);

  useEffect(() => {
    if (!active) return;

    if (!shouldLoad) {
      dispatch({ type: 'offline' });
      return;
    }

    let requestActive = true;
    dispatch({ type: 'load' });

    let service: StorefrontBootstrapService;
    try {
      service = createBootstrapService();
    } catch {
      dispatch({
        state: Object.freeze({ retryable: false, status: 'unavailable' }),
        type: 'resolve',
      });
      return;
    }

    void service
      .load()
      .then((result) => {
        if (!requestActive) return;

        if (result.kind === 'failed') {
          dispatch({
            state: catalogFailureState(result.failure),
            type: 'resolve',
          });
          return;
        }

        const projection = projectCatalogSnapshot(result.data);
        if (!projection.ok) {
          dispatch({
            state: Object.freeze({ retryable: true, status: 'unavailable' }),
            type: 'resolve',
          });
          return;
        }

        if (projection.status !== 'ready') {
          selectCategory(undefined);
          dispatch({
            state: Object.freeze({ status: projection.status }),
            type: 'resolve',
          });
          return;
        }

        dispatch({
          state: Object.freeze({ data: projection.snapshot, status: 'ready' }),
          type: 'resolve',
        });
      })
      .catch(() => {
        if (!requestActive) return;
        dispatch({
          state: Object.freeze({ retryable: true, status: 'unavailable' }),
          type: 'resolve',
        });
      });

    return () => {
      requestActive = false;
    };
  }, [active, createBootstrapService, reloadVersion, shouldLoad]);

  useEffect(() => {
    if (state.status !== 'ready') return;
    if (
      selectedCategoryId &&
      state.data.sections.some((section) => section.id === selectedCategoryId)
    ) {
      return;
    }
    selectCategory(state.data.sections[0]?.id);
  }, [selectedCategoryId, state]);

  const selectKnownCategory = useCallback(
    (categoryId: string) => {
      if (
        state.status === 'ready' &&
        state.data.sections.some((section) => section.id === categoryId)
      ) {
        selectCategory(categoryId);
      }
    },
    [state],
  );

  const value = useMemo<CatalogBrowseContextValue>(
    () => ({
      actions: Object.freeze({
        load,
        retry: load,
        selectCategory: selectKnownCategory,
      }),
      ...(selectedCategoryId ? { selectedCategoryId } : {}),
      state,
    }),
    [load, selectKnownCategory, selectedCategoryId, state],
  );

  return (
    <CatalogBrowseContext.Provider value={value}>
      {children}
    </CatalogBrowseContext.Provider>
  );
}

export function useCatalogBrowse(): CatalogBrowseContextValue {
  const value = useContext(CatalogBrowseContext);
  if (!value) {
    throw new Error('useCatalogBrowse must be used within CatalogBrowseProvider');
  }
  return value;
}
