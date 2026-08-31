import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getStoreClosedPresentation,
  STORE_CLOSED_SUPPORTING_COPY,
} from "./store-closed.ts";

test("store-closed copy is driven only by a supplied next ordering slot", () => {
  assert.deepEqual(
    getStoreClosedPresentation("Shoreditch", "Tomorrow, 8:30 AM"),
    {
      nextOrderingSlotLabel: "Tomorrow, 8:30 AM",
      storeName: "Shoreditch",
      supportingCopy: "Choose a later pickup time or find another store.",
    },
  );
  assert.equal(
    STORE_CLOSED_SUPPORTING_COPY,
    "Choose a later pickup time or find another store.",
  );
});

test("store-closed presentation does not require a fabricated next ordering slot", () => {
  assert.deepEqual(getStoreClosedPresentation("Shoreditch"), {
    nextOrderingSlotLabel: undefined,
    storeName: "Shoreditch",
    supportingCopy: "Choose a later pickup time or find another store.",
  });
});

test("store-closed presentation makes no physical-hours claim", () => {
  const source = readFileSync(
    new URL("./StoreClosedScreen.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /shut at|opens at|closing time|physical hours|device clock/i,
  );
  assert.match(source, /nextOrderingSlotLabel/);
  assert.match(source, /is closed/);
  assert.match(source, /presentation\.nextOrderingSlotLabel \?/);
  assert.match(source, /NEXT ORDERING TIME/);
  assert.match(source, /bordered=\{false\}[\s\S]{0,120}styles\.slotCard/);
  assert.match(source, /radius="action"/);
  assert.match(source, /maxWidth: 290/);
  assert.match(source, /content: \{[\s\S]{0,140}gap: spacing\[\'2xl\'\]/);
  assert.match(source, /heading: \{[\s\S]{0,120}gap: spacing\[\'2xl\'\]/);
  assert.doesNotMatch(source, /heading: \{[\s\S]{0,160}marginTop:/);
  assert.doesNotMatch(source, /slotCard: \{[\s\S]{0,180}marginTop:/);
  assert.doesNotMatch(source, /name="calendar"/);
});

test("store-closed route remains a standalone stack screen and uses server schedule navigation", () => {
  const route = readFileSync(
    new URL("../../app/store-closed.tsx", import.meta.url),
    "utf8",
  );
  const rootLayout = readFileSync(
    new URL("../../app/_layout.tsx", import.meta.url),
    "utf8",
  );

  assert.match(rootLayout, /<Stack\.Screen name="store-closed"/);
  assert.match(route, /nextOrderingSlotLabel/);
  assert.match(route, /router\.replace\('\/schedule'\)/);
  assert.match(route, /router\.replace\('\/locations'\)/);
  assert.doesNotMatch(route, /Date\(|toLocale|open until|shut at/i);
});
