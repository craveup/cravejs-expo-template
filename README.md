# Crave.js Expo Storefront

A branded mobile ordering app for restaurants, built on Expo and the public Crave Storefront API.

Menus, nested modifiers, an authoritative cart, pickup and delivery, customer accounts, order history
and capability-gated loyalty — as a parameterised Expo template you generate a project from, rather
than a repository you clone and rename.

**One commerce core. Typed brand configuration. Generated projects with real provenance.**

Expo SDK 57 · React Native 0.86 · React 19.2 · expo-router · TypeScript · MIT

> [!IMPORTANT]
> This repository is a generated public snapshot and a release candidate. The template, the fixture
> runtime and `template:materialize` work today; the public `crave` CLI generator has not shipped yet.
> Clone it to read, run and adapt the template — a clone is not a generated project.

## What you get

- **Browse and decide:** location bootstrap, timed menus, categories, search, product detail,
  availability and nested modifiers.
- **Build and recover a cart:** server-authoritative totals, revision preconditions, idempotent
  mutations, and explicit customer retry after a conflict.
- **Choose how to order:** pickup now or later, plus delivery where the merchant enables it.
- **Complete the handoff:** `checkout.prepare` returns an opaque URL that is validated against the
  environment's exact HTTPS hosted-checkout origin and opened in the system browser. The app embeds
  no payment UI and holds no provider secrets.
- **Come back recognised:** OTP account entry, profile, addresses, order history and gated loyalty.
- **Ship it as your own:** typed brand configuration generates names, scheme, bundle identifiers,
  icons, theme and fonts.

## Requirements

- Node.js 24 (see [`.nvmrc`](.nvmrc))
- Expo tooling resolved through the project (`npx expo`)
- Xcode for iOS, Android Studio for Android

## Run it

```bash
git clone https://github.com/craveup/cravejs-expo-template.git
cd cravejs-expo-template
npm ci
npm run verify
npm run ios
```

`npm run verify` is lint plus typecheck. `npm run ios`, `npm run android` and `npm run web` start the
app on each target.

Copy [`.env.example`](.env.example) to `.env` and fill in the values for your environment. Everything
prefixed `EXPO_PUBLIC_` is embedded in the app bundle and is public: the API origin, merchant and
location identifiers, the exact HTTPS hosted-checkout origin, and platform-restricted map keys. Never
add a Crave API key, a payment-provider secret, a customer token, or a cart or receipt capability.

## Make it your brand

Brand identity is data, not scattered literals. [`template/mobile-template.manifest.json`](template/mobile-template.manifest.json)
declares the display and legal names, slug, URL scheme, iOS bundle identifier, Android package, copy,
icons, colour and font profiles, legal and support links, namespaces and capability flags.

From that manifest the generator writes `src/config/brand.config.ts`, `src/config/brand-assets.ts`,
`src/theme/brand-theme.ts` and `src/theme/brand-fonts.ts`. Colour and font profile names are validated
against profiles the generator can actually materialise, so a project only ever receives a palette,
font bindings and font packages that exist.

```bash
npm run template:materialize
```

That is the canonical path to a complete customer project. It validates the pinned template, API and
SDK release tuple, stages output atomically, writes `.crave/mobile-template.json` provenance with
owned-file digests, and fails closed on a conflict, a symlinked target, or a destination inside the
immutable template source. Its `--dry-run` reports every file action, the normalised native identity,
the selected public environment keys, and the lifecycle and rollback commands.

[`docs/contracts/GENERATED-MOBILE-STARTER.md`](docs/contracts/GENERATED-MOBILE-STARTER.md) is
normative for registry identity, provenance, generation, upgrade and conflict handling, and rollback.

### Placeholder artwork

This public template ships neutral, repository-owned placeholder icons, splash images and a brand
mark instead of licensed artwork. Every shipped asset is recorded with its SHA-256 digest in
[`distribution/asset-ownership.json`](distribution/asset-ownership.json), and the release gate rejects
any image whose rights are not confirmed. Replace them with your own.

## Architecture

- **The app calls the public Storefront API directly.** There is no BFF and no Expo API-route layer.
  Every remote operation goes through `@craveup/storefront-sdk` behind one shared client; components
  never call `fetch`.
- **Routes compose, components render, domain logic stays pure.** Cart maths, modifier validation and
  fulfilment rules are typed modules testable without React or the network.
- **Money is never computed client-side as truth.** Prices, taxes, fees, discounts and totals come
  from the server; the UI renders what the API returns.
- **Sessions are environment-scoped.** The cart session and customer JWT live in `expo-secure-store`
  under keys namespaced by the validated API origin, merchant and location, so staging and production
  can never share records.
- **Conflicts refresh, they do not replay.** A revision conflict fetches authoritative state and
  requires explicit customer retry.
- **Secrets are never `EXPO_PUBLIC_*`.** Anything with that prefix is public by construction.

## Provenance

This repository is generated. Each commit is a validated snapshot of a reviewed private engineering
commit, and [`.crave/source.json`](.crave/source.json) records the exact source repository and commit.
Release tags are created only from a commit on `main` after an approval-gated workflow reverifies the
tree, so a published release names the precise bytes it was built from.

Send code and documentation changes here as pull requests; maintainers apply accepted changes to the
engineering source, and the next sync brings them back into this repository.

## Security

Report suspected vulnerabilities privately — see [SECURITY.md](SECURITY.md). Never include
credentials, customer data, cart capabilities or payment details in a public issue.

## License

[MIT](LICENSE) © Crave Up, Inc.
