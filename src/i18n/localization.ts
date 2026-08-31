import { brandConfig } from '../config/brand.config.ts';

export const APP_LOCALES = ['en', 'en-XA', 'ar-XB'] as const;

export type AppLocale = (typeof APP_LOCALES)[number];
export type LocaleDirection = 'ltr' | 'rtl';

export const englishMessages = {
  'account.action.help': 'Help & support',
  'account.action.orderHistory': 'Order history',
  'account.action.retryLocation': 'Try pickup location again',
  'account.action.savedStores': 'Saved stores',
  'account.action.signOut': 'Sign out',
  'account.balanceAccessibility': '{club}, {balance} available',
  'account.club': brandConfig.copy.signInClubLabel,
  'account.error': 'We could not load your account.',
  'account.loading': 'Loading your account',
  'account.screen': 'Account home',
  'account.unavailable': 'Account information is unavailable.',
  'action.add': 'Add to bag',
  'action.retry': 'Try again',
  'action.signIn': 'Sign in',
  'bag.action.browse': 'Browse the full menu',
  'bag.action.checkout': 'Checkout \u00b7 {total}',
  'bag.action.clear': 'Clear',
  'bag.action.clearConfirm': 'Clear it',
  'bag.action.keepBag': 'Keep my bag',
  'bag.action.keepItem': 'Keep it',
  'bag.action.remove': 'Remove it',
  'bag.action.removeShort': 'Remove',
  'bag.checkoutLocked':
    'Checkout was opened for this bag. Check order status before starting another checkout.',
  'bag.clear.body.one':
    'This drink comes out and you start again.',
  'bag.clear.body.other':
    'All {count} drinks come out and you start again.',
  'bag.clear.title': 'Clear your bag?',
  'bag.discount': 'Discount',
  'bag.empty.body': brandConfig.copy.bagEmptyBody,
  'bag.empty.title': brandConfig.copy.bagEmptyTitle,
  'bag.error':
    'We could not update your bag. Your last confirmed bag is still shown.',
  'bag.fulfillment.delivery': 'Delivery',
  'bag.fulfillment.pickup': 'Pickup',
  'bag.fulfillment.roomService': 'Room service',
  'bag.fulfillment.tableService': 'Table service',
  'bag.fulfillmentFee': 'Fulfillment fee',
  'bag.loading': 'Loading your bag',
  'bag.pointsClub': brandConfig.copy.signInClubLabel,
  'bag.pointsToEarn': '+{points} pts',
  'bag.quantity.decrease': 'Decrease {name} quantity',
  'bag.quantity.increase': 'Increase {name} quantity',
  'bag.remove.title': 'Remove this cup?',
  'bag.serviceFee': 'Service fee',
  'bag.subtotal': 'Subtotal',
  'bag.tax': 'Tax',
  'bag.tip': 'Tip',
  'bag.title': 'YOUR BAG',
  'bag.total': 'TOTAL',
  'bag.unavailable': 'Your bag is unavailable right now.',
  'checkout.action.continue': 'Continue to secure checkout',
  'checkout.action.status': 'Check order status',
  'checkout.availability.body':
    'We refreshed your bag because its contents changed. Review the latest total before continuing.',
  'checkout.availability.backAction': 'Back to bag',
  'checkout.availability.current': 'STILL IN YOUR BAG',
  'checkout.availability.currentEmpty': 'Your bag is now empty.',
  'checkout.availability.currentEmptyTitle': 'YOUR BAG NOW',
  'checkout.availability.menuAction': 'Pick something else instead',
  'checkout.availability.removed': 'REMOVED',
  'checkout.availability.request': 'Reference: {requestId}',
  'checkout.availability.reviewAction': 'Review updated checkout',
  'checkout.availability.reviewEmptyAction': 'Review updated bag',
  'checkout.availability.removedStatus': 'Removed',
  'checkout.availability.title': 'YOUR BAG JUST CHANGED',
  'checkout.availability.total': 'New total',
  'checkout.asap': 'As soon as possible',
  'checkout.customer': 'Customer',
  'checkout.error.cartChanged':
    'Your bag changed. Review the latest totals before continuing.',
  'checkout.error.expired':
    'That secure checkout link expired. Start a new attempt.',
  'checkout.error.offline':
    'Connect to the internet and try secure checkout again.',
  'checkout.error.prepareUnknown':
    'We did not receive the checkout response. Retry uses the same safe attempt.',
  'checkout.error.start':
    'Secure checkout could not start. Review your bag and try again.',
  'checkout.error.tipPending':
    'Finish the pending tip update before secure checkout.',
  'checkout.error.tipRetry': 'We could not update the tip. Try again safely.',
  'checkout.error.totalsUnavailable':
    'The latest checkout totals are unavailable.',
  'checkout.error.validationRefresh':
    'Your bag was refreshed after checkout validation. Review it before continuing.',
  'checkout.fulfillment': 'Pickup',
  'checkout.gratuity': 'Tip the flavoursmiths',
  'checkout.gratuity.none': 'None',
  'checkout.guest': 'Guest checkout',
  'checkout.handedOff': 'Secure checkout opened in your browser.',
  'checkout.items': 'Your order',
  'checkout.loading': 'Loading checkout',
  'checkout.orderTime': 'Pickup time',
  'checkout.outcomeUnknown':
    'We could not confirm what happened in the browser. Check your orders before trying again.',
  'checkout.retrySafe': 'Try secure checkout again',
  'checkout.signedIn': 'Signed in',
  'checkout.title': 'CHECKOUT',
  'checkout.unavailable': 'Secure checkout is unavailable right now.',
  'build.empty': 'No build options are available.',
  'build.error': 'We could not load these options.',
  'build.added': 'Added to your bag.',
  'build.addFailed': 'We could not add this drink. Try again safely.',
  'build.addToBag': 'Add my drink to the bag',
  'build.addToBagFrom': 'Add my drink to the bag · From {price}',
  'build.back': 'Back',
  'build.basePrice': 'From {price}',
  'build.loading': 'Loading build options',
  'build.notFound': 'This build is no longer on the menu.',
  'build.offline': 'Connect to the internet to build your drink.',
  'build.refreshRequired': 'Your bag changed. Review it, then try again.',
  'build.requiredOption': 'Choose an option for {group} to continue.',
  'build.selectionChanged': 'The available options changed. Review your selections.',
  'build.selectionEmpty': 'Choose each step to make this drink yours.',
  'build.selectionSummary': 'Your selections',
  'build.step': 'Step {number}',
  'build.title': 'Build your drink',
  'build.unavailable': 'Build your own is unavailable right now.',
  'catalog.empty': 'No menu items are available.',
  'catalog.error': 'We could not load the menu.',
  'catalog.categoriesTitle': brandConfig.copy.catalogCategoriesTitle,
  'catalog.footerBody': brandConfig.copy.catalogFooterBody,
  'catalog.footerTitle': brandConfig.copy.catalogFooterTitle,
  'catalog.fullMenu': 'Full menu',
  'catalog.heroEyebrow': brandConfig.copy.catalogHeroEyebrow,
  'catalog.heroTitle': brandConfig.copy.catalogHeroTitle,
  'catalog.loading': 'Loading menu',
  'catalog.locationLabel': 'Pickup',
  'catalog.menuCount': '{count} drinks',
  'catalog.notFound': 'This menu could not be found.',
  'catalog.offline': 'Connect to the internet to load the menu.',
  'catalog.orderingUnavailable': 'Ordering is unavailable right now',
  'catalog.popular': 'Popular right now',
  'catalog.requestId': 'Reference: {requestId}',
  'catalog.startOrder': 'Start an order',
  'catalog.title': 'Menu',
  'catalog.unavailableProduct': 'Unavailable',
  'catalog.unpublished': 'This menu is not published yet.',
  'catalog.unavailable': 'The menu is unavailable right now.',
  'common.unknown': 'Something went wrong.',
  'delivery.status.action.retry': 'Try again',
  'delivery.status.address': 'DELIVERING TO',
  'delivery.status.created': 'ORDER PLACED',
  'delivery.status.error.supporting': 'Try again to check the latest delivery status.',
  'delivery.status.error.title': 'We could not check your delivery',
  'delivery.status.failed.supporting': 'This delivery order was not completed.',
  'delivery.status.failed.title': 'Delivery order could not be completed',
  'delivery.status.loading': 'Checking your delivery',
  'delivery.status.noActive.supporting': 'There is no active delivery for this device.',
  'delivery.status.noActive.title': 'No active delivery',
  'delivery.status.offline.supporting': 'Connect to the internet and try again.',
  'delivery.status.offline.title': 'You are offline',
  'delivery.status.orderPending.supporting': 'Delivery details are not available yet.',
  'delivery.status.orderPending.title': 'Confirming your delivery order',
  'delivery.status.paymentPending.supporting': 'Delivery details are not available yet.',
  'delivery.status.paymentPending.title': 'Confirming your payment',
  'delivery.status.sessionExpired.supporting': 'This delivery is no longer available from this device.',
  'delivery.status.sessionExpired.title': 'Delivery access expired',
  'delivery.status.status': 'ORDER STATUS',
  'delivery.status.title': 'Delivery status',
  'delivery.status.unavailable.supporting': 'The latest delivery status is unavailable right now.',
  'delivery.status.unavailable.title': 'Delivery status unavailable',
  'delivery.status.updated': 'LAST UPDATED',
  'favourites.action.add': 'Add',
  'favourites.action.addAccessibility': 'Add {name} to bag',
  'favourites.action.added': 'Added',
  'favourites.action.addedMessage': 'Added to your bag.',
  'favourites.action.adding': 'Adding...',
  'favourites.action.failed': 'We could not add that favourite. Try again.',
  'favourites.action.refreshRequired':
    'Your bag changed. Review it, then try adding again.',
  'favourites.action.tryAgain': 'Try again',
  'favourites.empty': 'No favourites yet.',
  'favourites.error': 'We could not load your favourites.',
  'favourites.helper': 'Tap the star on any drink to keep it here.',
  'favourites.itemUnavailable': 'Saved item unavailable',
  'favourites.loading': 'Loading favourites',
  'favourites.missingProduct': 'This saved item is no longer available.',
  'favourites.offline': 'Connect to the internet to refresh your favourites.',
  'favourites.orderingUnavailable': 'Ordering is unavailable right now.',
  'favourites.repairRequired': 'Review this favourite before adding it.',
  'favourites.subtitle': 'Saved exactly how you like them.',
  'favourites.title': 'Your usuals',
  'favourites.unavailable': 'Favourites are unavailable right now.',
  'item.error': 'We could not load this item.',
  'item.added': 'Added to your bag.',
  'item.addFailed': 'We could not add this item. Try again safely.',
  'item.addCount': 'Add {quantity} to order',
  'item.addCountFrom': 'Add {quantity} to order · From {price}',
  'item.addToOrder': 'Add to order',
  'item.addUnavailable': 'This item could not be added right now.',
  'item.alternatives': 'Odd ones nearby',
  'item.back': 'Back',
  'item.calories': 'Cal',
  'item.chooseUpTo': 'Choose up to {count}',
  'item.decreaseOption': 'Decrease {name}',
  'item.decreaseQuantity': 'Decrease quantity',
  'item.howMany': 'How many',
  'item.included': 'Included',
  'item.increaseOption': 'Increase {name}',
  'item.increaseQuantity': 'Increase quantity',
  'item.ingredients': 'Ingredients',
  'item.loading': 'Loading item',
  'item.notFound': 'This item is no longer on the menu.',
  'item.offline': 'Connect to the internet to load this item.',
  'item.optionQuantity': '{name}, quantity {quantity}',
  'item.quantity': 'Quantity',
  'item.quantityValue': 'Quantity {quantity}',
  'item.refreshRequired': 'Your bag changed. Review it, then try again.',
  'item.removeFavourite': 'Remove from favourites',
  'item.required': 'Required',
  'item.saveFavourite': 'Save to favourites',
  'item.selectionChanged': 'The available options changed. Review your selections.',
  'item.selectedOptions': 'Selected options',
  'item.soldOut': 'Sold out',
  'item.soldOutToday': 'Sold out today',
  'item.unavailable': 'This item is unavailable.',
  'nutrition.calorieValue': '{count} cal',
  'nutrition.energy': 'Energy',
  'nutrition.error': 'We could not load nutrition information.',
  'nutrition.ingredients': 'Ingredients',
  'nutrition.loading': 'Loading nutrition information',
  'nutrition.notFound': 'This item is no longer on the menu.',
  'nutrition.notice':
    'Only published product details are shown. For allergy questions, ask the store directly.',
  'nutrition.offline': 'Connect to the internet to load nutrition information.',
  'nutrition.preferences': 'Dietary preferences',
  'nutrition.published': 'Published nutrition',
  'nutrition.title': 'Nutrition & ingredients',
  'nutrition.unavailable': 'Nutrition information is not available for this item.',
  'nutrition.unavailableTitle': 'No published nutrition details',
  'nutrition.viewDetails': 'Nutrition & ingredients',
  'orders.history.action.loadMore': 'Load more',
  'orders.history.empty': 'You have no previous orders.',
  'orders.history.error': 'We could not load your orders.',
  'orders.history.loading': 'Loading your orders',
  'orders.history.loadMoreError': 'We could not load more orders.',
  'orders.history.offline': 'You are offline. Check your connection and try again.',
  'orders.history.orderNumber': 'Order {shortId}',
  'orders.history.signedOut': 'Sign in to see your order history.',
  'orders.history.status.inProgress': 'In progress',
  'orders.history.title': 'Your orders',
  'orders.history.unavailable': 'Order history is unavailable right now.',
  'orders.status.completed.supporting': 'Your order details are confirmed.',
  'orders.status.completed.title': 'Order confirmed',
  'orders.status.empty.supporting': 'Your current order will appear here after checkout.',
  'orders.status.empty.title': 'No active order',
  'orders.status.error.supporting': 'Try again to check the latest status.',
  'orders.status.error.title': 'We could not check your order',
  'orders.status.failed.supporting': 'This order was not completed.',
  'orders.status.failed.title': 'Order could not be completed',
  'orders.status.fulfillment.delivery': 'Delivery',
  'orders.status.fulfillment.pickup': 'Pickup',
  'orders.status.fulfillment.roomService': 'Room service',
  'orders.status.fulfillment.tableService': 'Table service',
  'orders.status.item.one': 'item',
  'orders.status.item.other': 'items',
  'orders.status.loading': 'Checking your order',
  'orders.status.offline.supporting': 'Connect to the internet and try again.',
  'orders.status.offline.title': 'You are offline',
  'orders.status.orderNumber': 'Order {shortId}',
  'orders.status.orderPending.title': 'Confirming your order',
  'orders.status.paymentPending.title': 'Confirming your payment',
  'orders.status.pending.supporting': 'This screen updates automatically when the status changes.',
  'orders.status.sessionExpired.supporting': 'This order is no longer available from this device.',
  'orders.status.sessionExpired.title': 'Order access expired',
  'orders.status.title': 'Order status',
  'orders.status.unavailable.supporting': 'The latest order status is unavailable right now.',
  'storefront.header.account': 'Open account',
  'storefront.header.locationLoading': 'Loading pickup location',
  'storefront.header.locationUnavailable': 'Pickup location unavailable',
  'orders.status.unavailable.title': 'Order status unavailable',
  'rewards.account.action.history': 'History',
  'rewards.account.action.redeem': 'Redeem',
  'rewards.account.balanceAccessibility': '{points} reward points available',
  'rewards.account.empty': 'No rewards are available right now.',
  'rewards.account.error': 'We could not load your rewards.',
  'rewards.account.loading': 'Loading your rewards',
  'rewards.account.pointsCost': '{points} pts',
  'rewards.account.pointsUnit': 'POINTS',
  'rewards.account.redeemTitle': 'Redeem your points',
  'rewards.account.requiresOrder': 'Start an order to see rewards available for your cart.',
  'rewards.account.rewardApplied': 'Applied',
  'rewards.account.rewardCount': '{count} offers',
  'rewards.account.rewardUnavailable': 'Not available',
  'rewards.account.rewardsUnavailable': 'Rewards for your current order are unavailable right now.',
  'rewards.account.signedOut': 'Sign in to see your rewards.',
  'rewards.account.title': 'REWARDS',
  'rewards.account.unavailable': 'Rewards are unavailable right now.',
  'rewards.history.action.loadMore': 'Load more',
  'rewards.history.balanceAccessibility': '{points} available',
  'rewards.history.currentBalance': 'Current balance',
  'rewards.history.dateAndTime': '{date} · {time}',
  'rewards.history.dateShort': '{weekday} {day} {month}',
  'rewards.history.dateShortWithYear': '{weekday} {day} {month} {year}',
  'rewards.history.dateUnavailable': 'Date unavailable',
  'rewards.history.empty': 'No points activity yet.',
  'rewards.history.entryAccessibility': '{title}, {amount} {unit}, {date}',
  'rewards.history.entryUnavailable': 'Points activity',
  'rewards.history.error': 'We could not load your points history.',
  'rewards.history.loading': 'Loading your points history',
  'rewards.history.loadMoreError': 'We could not load more points activity.',
  'rewards.history.orderReference': 'Order {orderReference}',
  'rewards.history.pointsValue': '{points} pts',
  'rewards.history.signedOut': 'Sign in to see your points history.',
  'rewards.history.today': 'Today',
  'rewards.history.title': 'Points history',
  'rewards.history.unavailable': 'Points history is unavailable right now.',
  'rewards.redemption.action.back': 'Back to rewards',
  'rewards.redemption.action.cancel': 'Remove reward',
  'rewards.redemption.action.keep': 'Keep reward',
  'rewards.redemption.action.notYet': 'Not yet',
  'rewards.redemption.action.redeem': 'Redeem it',
  'rewards.redemption.balanceNow': 'Balance now',
  'rewards.redemption.cancelTitle': 'Remove this reward?',
  'rewards.redemption.error': 'We could not load this reward.',
  'rewards.redemption.loading': 'Loading reward confirmation',
  'rewards.redemption.notFound': 'This reward is no longer available.',
  'rewards.redemption.pointsValue': '{points} pts',
  'rewards.redemption.redeemTitle': 'Redeem for {points} pts?',
  'rewards.redemption.requiresOrder': 'Start an order before redeeming a reward.',
  'rewards.redemption.retryableError': 'We could not confirm the change. Try again safely.',
  'rewards.redemption.rewardCost': 'This reward',
  'rewards.redemption.rewardCostValue': '−{points} pts',
  'rewards.redemption.screenTitle': 'Reward confirmation',
  'rewards.redemption.signedOut': 'Sign in to manage rewards.',
  'rewards.redemption.terminalError': 'This reward could not be changed.',
  'rewards.redemption.unavailable': 'Reward redemption is unavailable right now.',
  'search.categoryAll': 'All',
  'search.clear': 'Clear search',
  'search.close': 'Close search',
  'search.empty': 'No matching items were found.',
  'search.error': 'We could not search the menu.',
  'search.loading': 'Searching menu',
  'search.noResultsBody': 'Check the spelling or browse a menu category instead.',
  'search.noResultsTitle': 'No odd ones match “{query}”',
  'search.placeholder': 'Search the menu',
  'search.resultCountOne': '{count} odd one for “{query}”',
  'search.resultCountOther': '{count} odd ones for “{query}”',
  'search.title': 'Search',
  'system.action.back': 'Go back',
  'system.action.home': 'Back to home',
  'system.error.supporting': 'Something went wrong on our side. You can go back to continue.',
  'system.error.title': "That didn't work",
  'system.offline.checking': 'Checking connection',
  'system.offline.supporting': "We can't reach the shop right now. Check your connection and try again.",
  'system.offline.title': "You've gone off the grid",
  'system.reference.accessibility': 'Error reference {requestId}',
  'system.reference.label': 'REFERENCE',
  'system.updateRequired.action': 'Update now',
  'system.updateRequired.supporting':
    'This version of the app is no longer supported. Update to keep ordering.',
  'system.updateRequired.title': 'Time for a fresh cup',
  'system.updateRequired.version': 'Version {version} \u00b7 required',
} as const;

export type TranslationKey = keyof typeof englishMessages;
export type TranslationParameters = Readonly<Record<string, string | number>>;

export function getLocaleDirection(locale: AppLocale): LocaleDirection {
  return locale === 'ar-XB' ? 'rtl' : 'ltr';
}

function interpolate(message: string, parameters: TranslationParameters): string {
  return message.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, name) =>
    Object.hasOwn(parameters, name) ? String(parameters[name]) : match,
  );
}

function pseudoLong(message: string): string {
  return `[!! ${message} ${message} !!]`;
}

export function translate(
  locale: AppLocale,
  key: TranslationKey,
  parameters: TranslationParameters = {},
): string {
  const message = interpolate(englishMessages[key], parameters);
  return locale === 'en-XA' ? pseudoLong(message) : message;
}

export function createTranslator(locale: AppLocale) {
  return (key: TranslationKey, parameters?: TranslationParameters) =>
    translate(locale, key, parameters);
}

function localeForIntl(locale: AppLocale): string {
  if (locale === 'en-XA') return 'en-US';
  if (locale === 'ar-XB') return 'ar';
  return 'en-US';
}

export function formatCurrency(locale: AppLocale, amount: number, currency: string): string | null {
  if (!Number.isFinite(amount) || !/^[A-Z]{3}$/.test(currency)) return null;
  return new Intl.NumberFormat(localeForIntl(locale), { style: 'currency', currency }).format(amount);
}

export function formatDate(
  locale: AppLocale,
  value: Date | number | string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(localeForIntl(locale), options).format(date);
  } catch {
    return null;
  }
}

export function formatTime(
  locale: AppLocale,
  value: Date | number | string,
  options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' },
): string | null {
  return formatDate(locale, value, options);
}

export function formatSignedNumber(
  locale: AppLocale,
  value: number,
): string | null {
  if (!Number.isFinite(value)) return null;
  try {
    const formatted = new Intl.NumberFormat(localeForIntl(locale), {
      maximumFractionDigits: 20,
    }).format(Math.abs(value));
    return value > 0 ? `+${formatted}` : value < 0 ? `−${formatted}` : formatted;
  } catch {
    return null;
  }
}

export function formatMeasurement(
  locale: AppLocale,
  value: number,
  unit: Intl.NumberFormatOptions['unit'],
): string | null {
  if (!Number.isFinite(value) || !unit) return null;
  try {
    return new Intl.NumberFormat(localeForIntl(locale), {
      maximumFractionDigits: 1,
      style: 'unit',
      unit,
      unitDisplay: 'short',
    }).format(value);
  } catch {
    return null;
  }
}

export function formatPlural(
  locale: AppLocale,
  count: number,
  labels: Readonly<{ one: string; other: string }>,
): string | null {
  if (!Number.isSafeInteger(count) || count < 0) return null;
  const category = new Intl.PluralRules(localeForIntl(locale)).select(count);
  return `${count} ${category === 'one' ? labels.one : labels.other}`;
}
