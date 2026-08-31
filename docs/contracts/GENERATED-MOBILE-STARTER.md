# Generated Mobile Starter Contract

- **Status:** Template materializer and unsigned immutable release-candidate contract implemented;
  signed public template release and CLI 2.0 registry publication pending
- **Audience:** Maintainers of this Expo template and the Crave CLI
- **CLI template ID:** `expo`
- **Repository:** `craveup/cravejs-expo-template`
- **Platform/profile:** `expo` / `template`
- **Required SDK:** exact `@craveup/storefront-sdk@2.0.1`
- **Platform release source reviewed:** `4c9a7763237dee3bcfaaf433275b84968655d1a4`
- **Security boundary:** Public release artifacts and public runtime configuration only

This is the normative contract between this repository and the Crave CLI. It defines how the CLI
resolves an immutable mobile-template release, generates a new Expo project, records provenance, and
upgrades or rolls back without overwriting user work. The template's default brand is the reference output.
`reference-brand` is only the deliberately unrelated acceptance fixture; it is not a CLI template ID
or runtime profile.

## 1. Canonical registry record

The core CLI registry contains exactly one mobile entry with this identity:

```ts
export type Sha256Sri = `sha256-${string}`; // SHA-256 digest encoded as canonical base64
export type Sha512Sri = `sha512-${string}`; // SHA-512 digest encoded as canonical base64
export type Sha256Hex = string; // exactly 64 lowercase hexadecimal characters

export interface ExpoTemplateRegistryEntry {
  id: "expo";
  repository: "craveup/cravejs-expo-template";
  platform: "expo";
  profile: "template";
  templateRelease: string; // exact semantic version, never a range or alias
  templateCommit: string; // exactly 40 lowercase hexadecimal characters
  templateIntegrity: Sha256Sri;
  minimumCliVersion: "2.0.0";
  configSchemaVersion: "1.0.0";
  configSchemaSha256: Sha256Hex;
  sdkPackage: "@craveup/storefront-sdk";
  sdkVersion: "2.0.1";
  sdkIntegrity: Sha512Sri;
  apiRelease: string;
  openapiSha256: Sha256Hex;
  templateManifestSha256: Sha256Hex;
  packageManager: "npm";
  generateCommand: "npm run template:materialize";
  verifyCommand: "npm run verify";
  startCommand: "npx expo start";
}
```

Release validation requires `templateIntegrity` to be `sha256-<base64>`, `sdkIntegrity` to be
`sha512-<base64>`, and every field whose name ends in `Sha256` to be exactly 64 lowercase hexadecimal
characters. Prefixes, base64/hex encodings, case, and digest lengths are not interchangeable.
`templateIntegrity` is the SHA-256 SRI of the exact canonical CLI payload. The payload is a
path-selected `git archive` from the recorded full commit, under the exact repository/version prefix
the CLI verifies, so ignored local credentials, caches, editor state and source-only governance do not
enter it. The public source repository remains a separate complete, self-verifying authoring tree.
The repository pins detected text to LF, rejects committed symbolic links, and derives the
config-validator and template-manifest digests from the exact members read back out of the payload.

Release automation writes this record from reviewed release evidence. Generation stops if the tag,
commit, template integrity, SDK integrity, exact API release, minimum CLI version, config-schema
version/digest, OpenAPI digest, or canonical template-manifest digest is absent or does not match the
downloaded artifacts. The selected customer brand manifest is generation input and is never part of
the immutable registry record. The CLI never uses a branch, abbreviated SHA, mutable archive,
`latest`, a workspace checkout, or a private repository coordinate.

The repository-local source of compatibility truth is
`template/release/compatibility.json`; both release assembly and materialization consume it through
one validator module. `template/release/template-release.schema.json` closes the immutable record to
the fields above. The config-schema digest is the byte SHA-256 of the canonical
`scripts/template-profile.mjs` validator identified by that policy. The reviewed public API evidence
is release `52cac07f74f1b8ca9a931354240560ef9beb4dce` with byte-exact generated OpenAPI SHA-256
`c7c980784820e8ab7dd42a0e66e648c6548f6b083a4f155665c1c3b5ac3d6722`.

From an exact clean checkout, maintainers can produce deterministic unsigned candidate evidence:

```bash
npm run template:release:candidate -- --output /absolute/empty/path/outside-the-repository
```

The command refuses uncommitted or untracked source, symbolic links, a relative or source-contained
destination, and non-empty output. It writes the exact-commit CLI payload plus a validated
`template-release.json`; it does not tag, sign, publish, deploy, or change repository visibility.
An independent verifier checks both files together:

```bash
node scripts/validate-template-release.mjs \
  --manifest /absolute/path/template-release.json \
  --artifact /absolute/path/cravejs-expo-template-<version>.tar
```

The SDK baseline is exactly `@craveup/storefront-sdk@2.0.1`. SDK `1.x`, `^2.0.1`, `~2.0.1`, `2.x`,
`latest`, Git/file/workspace references, and any other floating range are rejected. The package portion
of SDK Gate 0 is satisfied by npm SRI
`sha512-dqvAtGf9+0ZVbG57iDAXNs4HAy+N37u9bmx5+y8KFFsVxOkvrPP5rhrLv7BBKvLosdhooi8YRAQsWCW9xxuJog==`,
release tag `storefront-sdk-v2.0.1`, and source merge
`4c9a7763237dee3bcfaaf433275b84968655d1a4`. Matching tenant provisioning, public staging values, and
integration smoke evidence remain separate gates; the repository must not install an older or locally
rebuilt substitute.

### Current platform source evidence

Earlier route-level review at `14dc516e0cf34640d8c537b4f13e0c66be6771a1`, claim/cart-reuse revision
handling at `3f5fd896d19f60584393b5faa36331ae56797e48`, and recovered-cart persistence at
`9811e66d2c1a7da10e245180424000ce48af5e13` remain useful source evidence, not standalone release evidence.
The exact public package release is now tied to `storefront-sdk-v2.0.1` and
`4c9a7763237dee3bcfaaf433275b84968655d1a4`; tenant-specific deployed API and staging proof are still
required for the generated app's runtime gate.

Generated apps recover a known cart by calling `orderingSessions.start` with `existingCartId` and an
explicit numeric revision even when no local cart record survives. A successful recovery persists the
returned `locationId`, `cartId`, and authoritative revision; it stores a capability only when the SDK
returns or already holds one for that exact cart/scope. After a successful customer claim, the session
persists the returned cart/revision, removes the revoked guest capability, and uses the merchant-bound
customer JWT for later cart reads and mutations.

## 2. Generator inputs and dry run

Interactive prompts and noninteractive flags produce the same validated input:

```ts
export interface ExpoTemplateGeneratorInput {
  projectName: string;
  outputDirectory: string;
  displayName: string;
  legalName: string;
  slug: string;
  scheme: string;
  iosBundleIdentifier: string;
  androidPackage: string;
  brandManifest: string;
  brandAssetRoot: string;
  publicEnvironmentFile?: string;
}
```

Before writing, generation must provide a deterministic `--dry-run` that reports:

- the exact registry entry, template tag/commit/SHA-256 SRI, SDK version/SHA-512 SRI, API release,
  CLI version, config-schema version/SHA-256, OpenAPI SHA-256, canonical template-manifest SHA-256,
  and selected customer brand-manifest SHA-256;
- the normalized brand/native identifiers and selected public-environment keys;
- every file to create, replace, preserve, or reject as a conflict; and
- the install, verification, Expo export, native-build, and rollback commands that apply afterward.

Noninteractive generation fails rather than guessing required values. The target must be empty or
explicitly approved. The generator writes only files declared as generator-owned and never reads,
copies, or emits private Crave keys, customer sessions, cart/receipt capabilities, provider secrets,
or private repository content.

## 3. Brand identity versus deployment identity

`BrandConfig` contains reusable product identity only:

- display/legal name, slug, URL scheme, iOS bundle ID, and Android package;
- declared icons/splash and design-token/font profiles;
- declared customer-visible brand copy used by reusable screens, including catalog marketing
  headings, hero/footer copy, onboarding title/body, account-club label, and empty-location title;
- legal, privacy, terms, and support destinations;
- analytics namespace; and
- explicit capability flags.

The supported profile names are closed, versioned generator inputs rather than decorative metadata.
Generation writes `src/config/brand.config.ts`, `src/theme/brand-theme.ts`, and
`src/theme/brand-fonts.ts`; the selected color profile controls application/native presentation colors,
the selected font profile controls family bindings and per-weight imports, and generated package
metadata retains only that profile's direct font packages. An unknown profile fails manifest
validation. Repository-only Figma file keys, node IDs, baseline hashes, and plan evidence are not
copied into customer source.

An EAS project ID is **not** brand identity and must not appear in `BrandConfig`, the reusable brand
fixture, or the published template release. Each generated project provisions or attaches its own EAS
project after generation. That deployment identity is recorded separately in generated-project
deployment metadata such as `.crave/mobile-deployment.json`, together with the EAS owner, project ID,
environment/profile, update channel/runtime, and the operator/evidence that bound it. Re-running the
brand generator cannot silently create, replace, or rebind an EAS project.

## 4. Generated-project provenance

Every output contains `.crave/mobile-template.json` with this immutable source identity:

```ts
export interface GeneratedMobileTemplateProvenance {
  schemaVersion: 1;
  id: "expo";
  repository: "craveup/cravejs-expo-template";
  platform: "expo";
  profile: "template";
  templateRelease: string;
  templateCommit: string;
  templateIntegrity: Sha256Sri;
  minimumCliVersion: "2.0.0";
  configSchemaVersion: "1.0.0";
  configSchemaSha256: Sha256Hex;
  sdkPackage: "@craveup/storefront-sdk";
  sdkVersion: "2.0.1";
  sdkIntegrity: Sha512Sri;
  apiRelease: string;
  openapiSha256: Sha256Hex;
  templateManifestSha256: Sha256Hex;
  packageManager: "npm";
  generateCommand: "npm run template:materialize";
  verifyCommand: "npm run verify";
  startCommand: "npx expo start";
  generatedBy: string; // exact @craveup/cli version
  brandManifestSha256: Sha256Hex;
  generatedAt: string; // RFC 3339 UTC timestamp
  ownedFiles: Record<string, Sha256Hex>;
}
```

The exact tagged template exposes one CLI-facing project generator:

```bash
npm run template:materialize -- --asset-root <path> --manifest <path> --output <path> --release-metadata <path>
```

The materializer is the sole owner of generated `package.json` and
`package-lock.json` metadata. It updates them together for brand naming,
runnable generated-project commands, selected font dependencies, and lockfile
identity. The lower-level profile generator owns only the four brand files
declared by `generatedFiles`; it never emits a second package manifest.

It validates the immutable release tuple, canonical template-manifest digest, and config-schema
digest before writing, then computes the selected customer brand-manifest digest as generation
provenance. It rejects symlinked or conflicting targets, requires the destination to be outside the
immutable template source, stages the complete
customer project next to the destination, and renames it into place only
after every owned file and provenance record has been produced. Repeating the same command is byte
stable; a different target snapshot fails closed. `ownedFiles` records the SHA-256 of every
materializer-owned output other than the provenance file itself so later update planning can detect
customer edits before replacement.

`--asset-root` is the explicit trust root for the selected customer manifest and every asset it
declares. The manifest must be a regular non-symlinked file inside that root. Every asset path remains
relative, resolves to a regular file inside the same canonical root, and is rechecked immediately
before copying. Customer assets never need to be written into the immutable template extraction and
therefore cannot change `templateIntegrity`.

An absent or already-empty destination is creatable; the materializer removes an existing destination
only with an empty-directory operation immediately before the same-filesystem rename. A concurrently
changed or non-empty target remains untouched and fails as a conflict. `--dry-run` stages without
writing and returns the normalized brand/native identity, selected public environment key names,
exact release tuple, per-file create/preserve/conflict actions and current/expected digests, plus the
install, verify, platform export, native build, start, and CLI rollback commands.

The materializer validates the immutable tuple and the extracted config/template-manifest bytes before
copying provenance. The CLI verifies `templateIntegrity` against the downloaded tar before extraction,
then copies the immutable tuple from verified release metadata and adds its own exact
`generatedBy` version and canonical UTC `generatedAt` timestamp for generated-project provenance.
Prompts, environment variables, local Git state, brand fixtures, and EAS configuration cannot
override the release tuple. Pre-release repository acceptance derives fixture metadata from the
exact checkout solely to exercise the same command; a published CLI must verify the final tag,
commit, archive integrity, and extracted member digests before invoking it. `.crave/mobile-deployment.json` is a
separate generated-project record and is never copied back into template provenance.

## 5. Two-brand residue gate

Release CI generates both acceptance outputs from the same `template` profile:

1. `template/mobile-template.manifest.json`, the template's own default brand; and
2. `template/fixtures/reference-brand.json`, a deliberately unrelated test fixture.

`reference-brand` remains a fixture name only. It must never appear as a registry ID, runtime profile,
or published template choice.

The unrelated output must use different display/legal names, slug, scheme, bundle/package IDs,
assets and binary asset hashes, legal/support URLs, analytics namespace, deep-link hosts, notification
categories, capability selection, and generated native metadata. Residue scanning covers source,
configuration, generated Expo config, native identifiers, filenames, asset contents/hashes, localized
copy, legal/support destinations, analytics and notification namespaces, deep/universal/App Links,
snapshots, build metadata, and documentation. Any default-brand name, identifier, URL, asset, or
undeclared brand literal in the unrelated output fails the release. Reusable zero-network fixtures
must remain domain-neutral; known reference-business fixture terms are residue markers too.

Both outputs are produced through the CLI-facing `template:materialize` command and must pass a clean
install, generator/config validation, lint, typecheck, unit/contract
tests, `npm run verify`, `npm run expo:check`, supported Expo exports, secret/private-reference scans,
and the appropriate native smoke. Release CI enforces the clean-install and export portion through
`npm run template:acceptance`. Passing only the branded fixture is not template evidence.
The residue scan includes materialized color values, font packages/family identifiers, native splash
and adaptive-icon colors, file contents/names, and asset hashes.

## 6. Greenfield source replacement and reuse gate

Until the first public mobile/template release, this repository has no compatibility obligation for
old draft app behavior, SDK 1.x usage, or unpublished config, environment, route, screen, component,
hook, state, and file paths. When the approved contract replaces a draft, the same change updates every
repository-owned caller and removes obsolete code, exports, tests, snapshots, fixtures, and docs. It must
not add aliases, shims, feature flags, deprecated exports, parallel clients/stores, or old/new dual
implementations solely to preserve a draft.

Before creating a component, hook, state machine, transport adapter, or validator, the change inventories
the current implementation and callers. It reuses a stable correct unit, extracts shared behavior only
when concrete consumers justify a durable boundary, uses design-system variants and shared typed state
machines, and otherwise avoids premature abstraction. There is one Storefront API client and one
canonical implementation of auth, cart, authoritative-money handling, and tenant/environment scoping.
Release gates scan both generated brands for obsolete names, paths, copy, identifiers, assets, SDK 1.x
dependency/import/runtime references, duplicate implementations, and other residue.

This greenfield source rule stops at durable external or released contracts. Provider, Expo, and EAS
interfaces; approved persisted data and migration chains; already published SDK/API/CLI/template
artifacts; generated-project user-owned files; native/store/build identities; and rollout/rollback
requirements remain compatible under their versioned contracts. After the first published template
release, upgrades and replacements follow the file-ownership and migration rules below. Preserving a
published SDK 1.x artifact does not make it an accepted mobile dependency: generated apps reject SDK 1.x
and use only the Gate 0-approved exact SDK 2.0.1.

## 7. File ownership, upgrade, conflicts, and rollback

The release manifest declares generator-owned files and user-owned extension points. An upgrade never
rewrites arbitrary project files.

Every upgrade must:

1. verify current provenance and resolve an exact target release/integrity;
2. enforce the target minimum CLI, config-schema version/digest, and migration chain;
3. support `--dry-run` with deterministic file/config/native-dependency changes;
4. detect user edits and stop on conflicts rather than silently overwriting them;
5. preserve user-owned source, assets, environment values, native credentials, store records, and the
   separate EAS deployment identity;
6. stage changes recoverably, update provenance only after checks pass, and keep the previous
   provenance plus changed-file backup until acceptance;
7. run the frozen install, verification, Expo/native config checks, supported exports, residue scan,
   and migration-specific smoke; and
8. print and test a rollback command that restores the previous template release, generated files,
   lockfile, and provenance without deleting user-owned content or rebinding the EAS project.

Patch releases cannot break the config or generated-file contract. Minor releases may add compatible
optional inputs and codemods. Breaking config, SDK/API baseline, file ownership, native dependency, or
upgrade behavior requires a major template release and an explicit migration chain. Skipping a major
is rejected unless the published compatibility graph explicitly supports it.

## 8. Release acceptance evidence

The release record includes the exact template tag/commit/SHA-256 SRI, SDK version/SHA-512 SRI/source
SHA, API release, minimum CLI, config-schema version/SHA-256 and migration chain, OpenAPI SHA-256,
generator/brand-manifest SHA-256, both generated-project gate results, dependency/license/SBOM
provenance, API compatibility evidence, known conflicts, tested upgrade path, and tested rollback result. EAS build
IDs, binary checksums, store submissions, update channels/runtimes, and EAS project IDs belong to the
generated project's deployment record, not the reusable template or `BrandConfig`.

Acceptance also records the reuse inventory for replaced source and proves every owned caller moved to
the canonical implementation, obsolete draft code/tests/docs were deleted, and both generated brands
contain no old reference, compatibility-only alias/shim/flag, or duplicate transport/auth/cart/money/
tenant implementation.
