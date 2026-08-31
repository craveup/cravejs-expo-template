import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard } from 'react-native';

import { useCatalogBrowse } from '@/features/catalog';
import {
  parseInitialSearchQuery,
  projectCatalogSearchState,
  SearchPresentation,
} from '@/features/search';

export default function SearchRoute() {
  const params = useLocalSearchParams<{ q?: string | string[] }>();
  const initialQuery = parseInitialSearchQuery(params.q);
  const { actions, state: catalogState } = useCatalogBrowse();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>();
  const effectiveCategoryId =
    catalogState.status === 'ready' &&
    selectedCategoryId &&
    catalogState.data.sections.some(({ id }) => id === selectedCategoryId)
      ? selectedCategoryId
      : undefined;
  const state = useMemo(
    () => projectCatalogSearchState(catalogState, query, effectiveCategoryId),
    [catalogState, effectiveCategoryId, query],
  );

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  function browseCategory(categoryId: string) {
    actions.selectCategory(categoryId);
    router.replace('/menu');
  }

  function closeSearch() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/menu');
  }

  return (
    <SearchPresentation
      keyboardOpen={keyboardOpen}
      onBrowseCategory={browseCategory}
      onClearQuery={() => setQuery('')}
      onClose={closeSearch}
      onQueryChange={setQuery}
      onRetry={actions.retry}
      onSelectCategory={setSelectedCategoryId}
      onSelectProduct={(productId) =>
        router.push({ pathname: '/item/[productId]', params: { productId } })
      }
      query={query}
      selectedCategoryId={effectiveCategoryId}
      state={state}
    />
  );
}
