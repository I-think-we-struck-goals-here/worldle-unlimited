import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAliasIndex,
  compareGuess,
  directionFromTo,
  formatDistance,
  haversineKm,
  normalizeTerm,
  resolveCountry
} from "../src/game/logic.js";

test("normalizeTerm removes accents and punctuation", () => {
  const normalized = normalizeTerm("  Côte d'Ivoire  ");
  assert.equal(normalized, "cote d ivoire");
});

test("haversineKm returns zero for the same point", () => {
  assert.equal(haversineKm([10, 20], [10, 20]), 0);
});

test("haversineKm gives a realistic long-haul distance", () => {
  const londonToNewYork = haversineKm([-0.1276, 51.5072], [-74.006, 40.7128]);
  assert.ok(londonToNewYork > 5500 && londonToNewYork < 5650);
});

test("directionFromTo returns correct cardinal directions", () => {
  assert.equal(directionFromTo([0, 0], [15, 0]).label, "E");
  assert.equal(directionFromTo([0, 0], [0, 15]).label, "N");
  assert.equal(directionFromTo([0, 0], [-10, -10]).label, "SW");
});

test("buildAliasIndex removes ambiguous aliases while keeping names", () => {
  const countries = [
    { id: "AAA", name: "Alpha", aliases: ["Shared", "Al"] },
    { id: "BBB", name: "Beta", aliases: ["Shared", "Be"] }
  ];

  const aliasIndex = buildAliasIndex(countries);

  assert.equal(aliasIndex.get("shared"), undefined);
  assert.equal(aliasIndex.get("alpha"), "AAA");
  assert.equal(aliasIndex.get("beta"), "BBB");
});

test("resolveCountry maps aliases to canonical country", () => {
  const countries = [
    { id: "USA", name: "United States", aliases: ["USA"] }
  ];
  const aliasIndex = buildAliasIndex(countries);
  const countriesById = new Map(countries.map((country) => [country.id, country]));

  assert.equal(resolveCountry("usa", aliasIndex, countriesById)?.id, "USA");
  assert.equal(resolveCountry("unknown", aliasIndex, countriesById), null);
});

test("compareGuess returns formatted comparison fields", () => {
  const comparison = compareGuess(
    { id: "A", name: "A", centroid: [0, 0] },
    { id: "B", name: "B", centroid: [10, 0] }
  );

  assert.match(comparison.distanceText, /km$/);
  assert.equal(typeof comparison.distanceKm, "number");
  assert.equal(comparison.directionLabel, "E");
  assert.equal(formatDistance(1234.4), "1,234 km");
});
