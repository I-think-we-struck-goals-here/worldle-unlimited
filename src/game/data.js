import { geoCentroid } from "d3-geo";
import { feature as topoFeature } from "topojson-client";
import worldAtlas from "world-atlas/countries-50m.json";
import worldCountries from "world-countries";

const EXTRA_COUNTRIES = new Set(["KOS", "PSE", "TWN", "VAT"]);

const CUSTOM_ALIASES = {
  BRN: ["Brunei Darussalam"],
  COG: ["Republic of the Congo", "Congo Republic"],
  COD: ["DR Congo", "DRC", "Democratic Republic of the Congo"],
  CIV: ["Ivory Coast"],
  CZE: ["Czech Republic"],
  GBR: ["UK", "U.K.", "Britain", "Great Britain"],
  KOR: ["Republic of Korea"],
  PRK: ["DPRK", "Democratic People's Republic of Korea"],
  MMR: ["Burma"],
  MKD: ["Macedonia"],
  RUS: ["Russian Federation"],
  SWZ: ["Swaziland"],
  TZA: ["United Republic of Tanzania"],
  TLS: ["East Timor"],
  USA: ["United States", "USA", "US", "U.S.", "America"],
  VEN: ["Venezuela"],
  VNM: ["Viet Nam"]
};

function buildEligibleCountryMap() {
  const byNumericCode = new Map();

  for (const country of worldCountries) {
    if (!country.ccn3) {
      continue;
    }

    const isEligible =
      country.unMember ||
      country.independent ||
      EXTRA_COUNTRIES.has(country.cca3);

    if (!isEligible) {
      continue;
    }

    byNumericCode.set(String(Number(country.ccn3)), country);
  }

  return byNumericCode;
}

function getAliases(countryMeta, featureName) {
  const aliases = new Set();

  aliases.add(countryMeta.name.common);
  aliases.add(countryMeta.name.official);

  if (featureName && featureName !== countryMeta.name.common) {
    aliases.add(featureName);
  }

  for (const alt of countryMeta.altSpellings ?? []) {
    if (alt.length > 2) {
      aliases.add(alt);
    }
  }

  for (const custom of CUSTOM_ALIASES[countryMeta.cca3] ?? []) {
    aliases.add(custom);
  }

  return [...aliases];
}

function buildCountryCatalog() {
  const eligibleByCode = buildEligibleCountryMap();
  const geoFeatures = topoFeature(worldAtlas, worldAtlas.objects.countries).features;
  const seen = new Set();

  const catalog = [];

  for (const geoFeature of geoFeatures) {
    const numericCode = String(Number(geoFeature.id));
    const countryMeta = eligibleByCode.get(numericCode);

    if (!countryMeta || seen.has(countryMeta.cca3)) {
      continue;
    }

    const centroid = geoCentroid(geoFeature);
    if (!Number.isFinite(centroid[0]) || !Number.isFinite(centroid[1])) {
      continue;
    }

    seen.add(countryMeta.cca3);
    catalog.push({
      id: countryMeta.cca3,
      name: countryMeta.name.common,
      aliases: getAliases(countryMeta, geoFeature.properties?.name),
      centroid,
      geometry: geoFeature.geometry
    });
  }

  return catalog.sort((a, b) => a.name.localeCompare(b.name));
}

export const countries = buildCountryCatalog();
export const countriesById = new Map(countries.map((country) => [country.id, country]));
export const countryNames = countries.map((country) => country.name);
