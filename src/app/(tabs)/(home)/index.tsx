import { useRouter } from 'expo-router';

import {
  HomeCatalogPresentation,
  useCatalogBrowse,
} from '@/features/catalog';

export default function HomeRoute() {
  const router = useRouter();
  const { actions, state } = useCatalogBrowse();

  return (
    <HomeCatalogPresentation
      onOpenMenu={() => router.push('/menu')}
      onRetry={actions.retry}
      onSelectProduct={(productId) =>
        router.push({ pathname: '/item/[productId]', params: { productId } })
      }
      onStartOrder={() => router.push('/menu')}
      state={state}
    />
  );
}
