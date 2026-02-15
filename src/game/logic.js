const RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

const DIRECTION_LABELS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const DIRECTION_ARROWS = {
  N: "↑",
  NE: "↗",
  E: "→",
  SE: "↘",
  S: "↓",
  SW: "↙",
  W: "←",
  NW: "↖",
  HERE: "•"
};

function toRadians(value) {
  return value * RAD;
}

export function normalizeTerm(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function haversineKm(from, to) {
  const [lon1, lat1] = from;
  const [lon2, lat2] = to;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function directionFromTo(from, to) {
  const [lon1, lat1] = from;
  const [lon2, lat2] = to;

  if (Math.abs(lon1 - lon2) < 1e-8 && Math.abs(lat1 - lat2) < 1e-8) {
    return {
      label: "HERE",
      arrow: DIRECTION_ARROWS.HERE,
      bearing: 0
    };
  }

  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const deltaLambda = toRadians(lon2 - lon1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const rawBearing = Math.atan2(y, x);
  const bearing = ((rawBearing * 180) / Math.PI + 360) % 360;

  const directionIndex = Math.round(bearing / 45) % 8;
  const label = DIRECTION_LABELS[directionIndex];

  return {
    label,
    arrow: DIRECTION_ARROWS[label],
    bearing
  };
}

export function formatDistance(km) {
  return `${Math.round(km).toLocaleString()} km`;
}

export function buildAliasIndex(countries) {
  const aliasIndex = new Map();
  const collisions = new Set();

  for (const country of countries) {
    const allTerms = [country.name, ...(country.aliases ?? [])];

    for (const term of allTerms) {
      const normalized = normalizeTerm(term);
      if (!normalized) {
        continue;
      }

      const existing = aliasIndex.get(normalized);
      if (existing && existing !== country.id) {
        collisions.add(normalized);
        continue;
      }

      aliasIndex.set(normalized, country.id);
    }
  }

  for (const collided of collisions) {
    aliasIndex.delete(collided);
  }

  for (const country of countries) {
    aliasIndex.set(normalizeTerm(country.name), country.id);
  }

  return aliasIndex;
}

export function resolveCountry(value, aliasIndex, countriesById) {
  const normalized = normalizeTerm(value);
  if (!normalized) {
    return null;
  }

  const countryId = aliasIndex.get(normalized);
  if (!countryId) {
    return null;
  }

  return countriesById.get(countryId) ?? null;
}

export function compareGuess(guessCountry, targetCountry) {
  const distanceKm = haversineKm(guessCountry.centroid, targetCountry.centroid);
  const direction = directionFromTo(guessCountry.centroid, targetCountry.centroid);

  return {
    distanceKm,
    distanceText: formatDistance(distanceKm),
    directionLabel: direction.label,
    directionArrow: direction.arrow
  };
}

export function createRound(countries, maxGuesses = 5) {
  const target = countries[Math.floor(Math.random() * countries.length)];
  return {
    maxGuesses,
    targetId: target.id,
    guesses: [],
    status: "playing"
  };
}
