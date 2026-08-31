import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getAddressEntryState,
  getCurrentLocationActionState,
  selectAddressCandidate,
  type AddressCandidatePresentation,
} from "./address-entry.ts";

const candidates: AddressCandidatePresentation[] = [
  { id: "one", primaryLabel: "10 Market Street", secondaryLabel: "London" },
  { id: "two", primaryLabel: "12 Market Street", secondaryLabel: "London" },
];

test("address entry exposes controlled loading, error, empty, and result states", () => {
  assert.equal(getAddressEntryState("", 0, false), "idle");
  assert.equal(getAddressEntryState("market", 0, true), "loading");
  assert.equal(
    getAddressEntryState("market", 0, false, "Search failed"),
    "error",
  );
  assert.equal(getAddressEntryState("market", 0, false), "empty");
  assert.equal(getAddressEntryState("market", 2, false), "results");
});

test("candidate selection returns only a supplied address candidate", () => {
  assert.equal(selectAddressCandidate(candidates, "two"), candidates[1]);
  assert.equal(selectAddressCandidate(candidates, "missing"), undefined);
});

test("current location UI requires both provider callback and permission state", () => {
  assert.equal(getCurrentLocationActionState(false, "granted"), "hidden");
  assert.equal(getCurrentLocationActionState(true), "hidden");
  assert.equal(getCurrentLocationActionState(true, "prompt"), "enabled");
  assert.equal(getCurrentLocationActionState(true, "granted"), "enabled");
  assert.equal(getCurrentLocationActionState(true, "denied"), "disabled");
  assert.equal(getCurrentLocationActionState(true, "unavailable"), "disabled");
});

test("address candidates are never presented as serviceable or deliverable", () => {
  const source = readFileSync(
    new URL("./DeliveryAddressScreen.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /serviceable|deliverable|delivery available|within range/i,
  );
  assert.match(source, /Address candidates/);
  assert.doesNotMatch(source, /fetch\(|process\.env|EXPO_PUBLIC_/);
  assert.match(source, /Where are we bringing it\?/);
  assert.match(source, /variant="heading">Where are we bringing it\?/);
  assert.match(source, /SUGGESTIONS/);
  assert.match(source, /borderColor: colors\.accent/);
  assert.match(source, /bordered=\{false\}[\s\S]{0,180}styles\.candidate/);
  assert.match(source, /styles\.candidateList/);
  assert.doesNotMatch(source, /styles\.resultsCard|styles\.candidateBorder/);
  assert.ok(
    source.indexOf("Address candidates") <
      source.indexOf("Use my current location"),
  );
  assert.match(source, /MerchantLocationHeader/);
  assert.match(source, /background="contentCanvas"/);
  assert.match(source, /intro: \{[\s\S]{0,100}marginTop: spacing\.sm/);
  assert.match(
    source,
    /bordered=\{false\}[\s\S]{0,120}radius="action"[\s\S]{0,120}styles\.candidate/,
  );
  assert.match(
    source,
    /currentLocationLabel: \{[\s\S]{0,100}fontFamily: fontFamilies\.bodySemiBold/,
  );
  assert.match(source, /variant="label">[\s\S]{0,40}SUGGESTIONS/);
});
