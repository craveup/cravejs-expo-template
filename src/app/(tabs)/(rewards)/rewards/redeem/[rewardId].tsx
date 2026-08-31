import { router, type Href, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { brandConfig } from '@/config/brand.config';
import type { BrandConfig } from '@/config/brand.types';
import type { CustomerAuthState } from '@/features/auth/customer-auth-state';
import { useCustomerAuthState } from '@/features/auth/use-customer-auth-state';
import { useMerchantLocationHeader } from '@/features/_shared';
import {
  createRewardMutationKey,
  createRewardSubmissionGuard,
  loadRewardRedemption,
  RewardRedemptionPresentation,
  submitRewardRedemption,
  toRewardRedemptionPresentation,
  type RewardRedemptionLoadResult,
  type RewardRedemptionPresentationState,
  type RewardRedemptionSnapshot,
} from '@/features/rewards';
import { getStorefrontRuntime } from '@/lib/storefront';

type CustomerAuthenticatedState = Extract<
  CustomerAuthState,
  Readonly<{ status: 'authenticated' }>
>;

type RedemptionLoad = Readonly<{
  attempt: number;
  rewardId: string;
  result: RewardRedemptionLoadResult;
  session: CustomerAuthenticatedState;
}>;

type RedemptionSubmission = Readonly<{
  idempotencyKey: string;
  snapshot: RewardRedemptionSnapshot;
  status:
    | 'pending'
    | 'retryable_error'
    | 'signed_out'
    | 'terminal_error';
}>;

const runtimeBrand: BrandConfig = brandConfig;

function goBackToRewards() {
  if (router.canGoBack()) router.back();
  else router.replace('/rewards' as Href);
}

export default function RewardRedemptionRoute() {
  const params = useLocalSearchParams<{
    rewardId?: string | string[];
  }>();
  const rewardId = typeof params.rewardId === 'string' ? params.rewardId : '';

  if (runtimeBrand.capabilities.loyalty !== 'enabled') {
    return (
      <>
        <StatusBar style="dark" />
        <RewardRedemptionPresentation
          merchantHeaderState={{ status: 'unavailable' }}
          onDismiss={goBackToRewards}
          state={{ status: 'unavailable' }}
        />
      </>
    );
  }

  return <EnabledRewardRedemptionRoute key={rewardId} rewardId={rewardId} />;
}

function EnabledRewardRedemptionRoute({ rewardId }: Readonly<{ rewardId: string }>) {
  const runtime = getStorefrontRuntime();
  const auth = runtime.services.customerAuth;
  const authState = useCustomerAuthState(auth);
  const merchantHeader = useMerchantLocationHeader(runtime.services.bootstrap);
  const restoreStarted = useRef(false);
  const intentSequence = useRef(0);
  const [submissionGuard] = useState(createRewardSubmissionGuard);
  const [sessionChecked, setSessionChecked] = useState(
    () => authState.status !== 'signed_out',
  );
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<RedemptionLoad>();
  const [submission, setSubmission] = useState<RedemptionSubmission>();

  const dependencies = useMemo(
    () => ({
      cartSessions: runtime.cartSessions,
      locationId: runtime.environment.locationId,
      loyalty: runtime.services.loyalty,
    }),
    [runtime],
  );

  useEffect(() => {
    if (restoreStarted.current || authState.status !== 'signed_out') return;

    restoreStarted.current = true;
    void auth.restore().finally(() => setSessionChecked(true));
  }, [auth, authState.status]);

  useEffect(() => {
    if (authState.status !== 'authenticated') return;

    let active = true;
    const authenticatedState = authState;

    void loadRewardRedemption(dependencies, rewardId).then((result) => {
      if (active) {
        setLoad({ attempt, result, rewardId, session: authenticatedState });
      }
    });

    return () => {
      active = false;
    };
  }, [attempt, authState, dependencies, rewardId]);

  const currentLoad =
    authState.status === 'authenticated' &&
    load?.attempt === attempt &&
    load.rewardId === rewardId &&
    load.session === authState
      ? load.result
      : undefined;
  const snapshot = currentLoad?.kind === 'ready' ? currentLoad.snapshot : undefined;
  const currentSubmission =
    snapshot && submission?.snapshot === snapshot ? submission : undefined;

  useLayoutEffect(() => {
    submissionGuard.invalidate();
    return () => {
      submissionGuard.invalidate();
    };
  }, [snapshot, submissionGuard]);

  const presentation: RewardRedemptionPresentationState =
    !sessionChecked || authState.status === 'restoring'
      ? { status: 'loading' }
      : authState.status === 'profile_unavailable'
        ? { status: 'error' }
        : authState.status !== 'authenticated'
          ? { status: 'signed_out' }
          : !currentLoad
            ? { status: 'loading' }
            : currentLoad.kind === 'failed'
              ? currentLoad.state
              : currentSubmission?.status === 'signed_out'
                ? { status: 'signed_out' }
                : toRewardRedemptionPresentation(
                    currentLoad.snapshot,
                    currentSubmission?.status === 'terminal_error'
                      ? 'terminal_error'
                      : currentSubmission?.status ?? 'idle',
                  );

  async function submit() {
    if (!snapshot) return;
    const submissionGeneration = submissionGuard.begin();
    if (submissionGeneration === undefined) return;

    const idempotencyKey =
      currentSubmission?.idempotencyKey ??
      createRewardMutationKey(Date.now(), ++intentSequence.current);
    setSubmission({ idempotencyKey, snapshot, status: 'pending' });

    const result = await submitRewardRedemption(
      dependencies,
      snapshot,
      idempotencyKey,
    );
    if (!submissionGuard.complete(submissionGeneration)) return;

    if (result.kind === 'completed') {
      goBackToRewards();
      return;
    }
    if (result.kind === 'refresh_required') {
      setAttempt((value) => value + 1);
      return;
    }
    setSubmission({
      idempotencyKey,
      snapshot,
      status:
        result.kind === 'retryable_error'
          ? 'retryable_error'
          : result.kind === 'signed_out'
            ? 'signed_out'
            : 'terminal_error',
    });
  }

  return (
    <>
      <StatusBar style="dark" />
      <RewardRedemptionPresentation
        merchantHeaderState={merchantHeader.state}
        onDismiss={goBackToRewards}
        onOpenAccount={() => router.push('/account' as Href)}
        onRetry={() => {
          merchantHeader.retry();
          if (authState.status === 'profile_unavailable') void auth.retryProfile();
          else setAttempt((value) => value + 1);
        }}
        onSignIn={() => router.push('/sign-in' as Href)}
        onSubmit={() => void submit()}
        state={presentation}
      />
    </>
  );
}
