export {
  canStartNewCheckoutHandoff,
  initialCheckoutHandoffState,
  isProvenPreHandoffFailure,
  transitionCheckoutHandoff,
} from './checkout-state-machine.ts';
export type {
  CheckoutHandoffEvent,
  CheckoutHandoffState,
  CheckoutHandoffTransitionFailure,
  CheckoutHandoffTransitionResult,
} from './types.ts';
