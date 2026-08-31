import { type Href, useRouter } from 'expo-router';

import {
  MenuCatalogPresentation,
  useCatalogBrowse,
} from '@/features/catalog';

export default function MenuRoute() {
  const router = useRouter();
  const { actions, selectedCategoryId, state } = useCatalogBrowse();

  return (
    <MenuCatalogPresentation
      onRetry={actions.retry}
      onSearch={() => router.push('/search' as Href)}
      onSelectCategory={actions.selectCategory}
      onSelectProduct={(productId) =>
        router.push({ pathname: '/item/[productId]', params: { productId } })
      }
      selectedCategoryId={selectedCategoryId}
      state={state}
    />
  );
}
