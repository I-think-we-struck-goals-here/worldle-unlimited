import "./styles.css";
import { geoMercator, geoPath } from "d3-geo";
import { countries, countriesById } from "./game/data";
import {
  buildAliasIndex,
  compareGuess,
  createRound,
  normalizeTerm,
  resolveCountry
} from "./game/logic";

const MAX_SUGGESTIONS = 8;
const MAX_GUESSES = 5;

const aliasIndex = buildAliasIndex(countries);
const searchIndex = countries.map((country) => ({
  id: country.id,
  name: country.name,
  normalizedName: normalizeTerm(country.name)
}));

const guessForm = document.querySelector("#guess-form");
const guessInput = document.querySelector("#country-input");
const clearInputButton = document.querySelector("#clear-input");
const guessButton = document.querySelector("#guess-button");
const newGameButton = document.querySelector("#new-game-button");
const suggestionList = document.querySelector("#suggestion-list");
const statusMessage = document.querySelector("#status-message");
const guessesLeft = document.querySelector("#guesses-left");
const roundPill = document.querySelector("#round-pill");
const guessRows = document.querySelector("#guess-rows");
const silhouettePath = document.querySelector("#country-shape");
const silhouetteStage = document.querySelector("#silhouette-stage");

let highlightedSuggestionIndex = -1;
let visibleSuggestions = [];
let selectedSuggestionId = null;
let roundNumber = 0;
let game = createRound(countries, MAX_GUESSES);

function getTargetCountry() {
  return countriesById.get(game.targetId);
}

function getSuggestions(value) {
  const query = normalizeTerm(value);

  if (!query) {
    return searchIndex.slice(0, MAX_SUGGESTIONS);
  }

  const startsWith = [];
  const includes = [];

  for (const entry of searchIndex) {
    if (entry.normalizedName.startsWith(query)) {
      startsWith.push(entry);
    } else if (entry.normalizedName.includes(query)) {
      includes.push(entry);
    }
  }

  return [...startsWith, ...includes].slice(0, MAX_SUGGESTIONS);
}

function clearSuggestions() {
  suggestionList.innerHTML = "";
  visibleSuggestions = [];
  highlightedSuggestionIndex = -1;
  guessInput.setAttribute("aria-expanded", "false");
  guessInput.setAttribute("aria-activedescendant", "");
}

function setHighlightedSuggestion(index) {
  highlightedSuggestionIndex = index;

  const options = suggestionList.querySelectorAll("li");
  options.forEach((option, optionIndex) => {
    option.classList.toggle("active", optionIndex === index);
  });

  const activeItem = options[index];
  guessInput.setAttribute(
    "aria-activedescendant",
    activeItem ? activeItem.id : ""
  );
}

function renderSuggestions(suggestions) {
  visibleSuggestions = suggestions;
  suggestionList.innerHTML = "";

  if (suggestions.length === 0) {
    guessInput.setAttribute("aria-expanded", "false");
    return;
  }

  for (let index = 0; index < suggestions.length; index += 1) {
    const suggestion = suggestions[index];
    const option = document.createElement("li");
    option.id = `suggestion-${index}`;
    option.setAttribute("role", "option");
    option.textContent = suggestion.name;
    option.dataset.countryId = suggestion.id;

    option.addEventListener("mousedown", (event) => {
      event.preventDefault();
      applySuggestion(suggestion);
    });

    suggestionList.append(option);
  }

  guessInput.setAttribute("aria-expanded", "true");
}

function applySuggestion(suggestion) {
  guessInput.value = suggestion.name;
  selectedSuggestionId = suggestion.id;
  clearSuggestions();
  setStatus("Country selected. Press submit to lock in your guess.", "info");
}

function setStatus(message, tone = "info") {
  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
}

function renderSilhouette() {
  const target = getTargetCountry();
  const feature = {
    type: "Feature",
    geometry: target.geometry,
    properties: { name: target.name }
  };

  const projection = geoMercator();
  projection.fitExtent(
    [
      [18, 18],
      [422, 262]
    ],
    feature
  );

  const pathBuilder = geoPath(projection);
  const pathData = pathBuilder(feature) ?? "";

  silhouettePath.setAttribute("d", pathData);
  silhouetteStage.classList.remove("pulse");
  window.requestAnimationFrame(() => {
    silhouetteStage.classList.add("pulse");
  });
}

function renderGuessRows() {
  guessRows.innerHTML = "";

  for (let i = 0; i < game.guesses.length; i += 1) {
    const guess = game.guesses[i];
    const row = document.createElement("tr");

    if (guess.correct) {
      row.classList.add("correct");
    }

    const attemptCell = document.createElement("td");
    attemptCell.textContent = String(i + 1);

    const countryCell = document.createElement("td");
    countryCell.textContent = guess.name;

    const distanceCell = document.createElement("td");
    distanceCell.textContent = guess.distanceText;

    const directionCell = document.createElement("td");
    const directionArrow = document.createElement("span");
    directionArrow.className = "direction-arrow";
    directionArrow.textContent = guess.directionArrow;
    directionCell.append(directionArrow, guess.directionLabel);

    row.append(attemptCell, countryCell, distanceCell, directionCell);
    guessRows.append(row);
  }
}

function updateControlState() {
  const isPlaying = game.status === "playing";
  guessInput.disabled = !isPlaying;
  guessButton.disabled = !isPlaying;

  const guessesRemaining = Math.max(0, game.maxGuesses - game.guesses.length);
  guessesLeft.textContent = `${guessesRemaining} guess${guessesRemaining === 1 ? "" : "es"} left`;
}

function resolveInputCountry() {
  if (selectedSuggestionId) {
    const selected = countriesById.get(selectedSuggestionId);
    if (selected && normalizeTerm(selected.name) === normalizeTerm(guessInput.value)) {
      return selected;
    }
  }

  return resolveCountry(guessInput.value, aliasIndex, countriesById);
}

function lockGuess(country) {
  if (game.status !== "playing") {
    return;
  }

  const target = getTargetCountry();
  const duplicate = game.guesses.some((guess) => guess.id === country.id);

  if (duplicate) {
    setStatus("You already guessed that country. Pick a new one.", "warning");
    return;
  }

  const comparison = compareGuess(country, target);
  const correct = country.id === target.id;

  game.guesses.push({
    id: country.id,
    name: country.name,
    ...comparison,
    correct
  });

  if (correct) {
    game.status = "won";
    setStatus(`Correct. ${target.name} found in ${game.guesses.length} guess(es).`, "success");
  } else if (game.guesses.length >= game.maxGuesses) {
    game.status = "lost";
    setStatus(`Round over. The country was ${target.name}. Start a new round.`, "error");
  } else {
    setStatus(
      `${country.name}: ${comparison.distanceText} ${comparison.directionArrow} ${comparison.directionLabel}`,
      "info"
    );
  }

  guessInput.value = "";
  selectedSuggestionId = null;
  clearSuggestions();
  renderGuessRows();
  updateControlState();
}

function startNewRound() {
  roundNumber += 1;
  game = createRound(countries, MAX_GUESSES);
  roundPill.textContent = `Round ${roundNumber}`;

  guessRows.innerHTML = "";
  guessInput.value = "";
  selectedSuggestionId = null;

  renderSilhouette();
  updateControlState();
  clearSuggestions();

  setStatus("New round started. Pick your first country guess.", "info");
  guessInput.focus();
}

function wireEvents() {
  guessInput.addEventListener("input", () => {
    selectedSuggestionId = null;
    const suggestions = getSuggestions(guessInput.value);
    renderSuggestions(suggestions);
    setHighlightedSuggestion(-1);
  });

  guessInput.addEventListener("keydown", (event) => {
    if (visibleSuggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex =
        highlightedSuggestionIndex + 1 >= visibleSuggestions.length
          ? 0
          : highlightedSuggestionIndex + 1;
      setHighlightedSuggestion(nextIndex);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const previousIndex =
        highlightedSuggestionIndex - 1 < 0
          ? visibleSuggestions.length - 1
          : highlightedSuggestionIndex - 1;
      setHighlightedSuggestion(previousIndex);
      return;
    }

    if (event.key === "Enter" && highlightedSuggestionIndex >= 0) {
      event.preventDefault();
      applySuggestion(visibleSuggestions[highlightedSuggestionIndex]);
      return;
    }

    if (event.key === "Escape") {
      clearSuggestions();
    }
  });

  guessInput.addEventListener("blur", () => {
    window.setTimeout(() => {
      clearSuggestions();
    }, 100);
  });

  clearInputButton.addEventListener("click", () => {
    guessInput.value = "";
    selectedSuggestionId = null;
    clearSuggestions();
    guessInput.focus();
  });

  guessForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (game.status !== "playing") {
      return;
    }

    const country = resolveInputCountry();

    if (!country) {
      setStatus("That input does not match a valid country in this game.", "error");
      return;
    }

    lockGuess(country);
  });

  newGameButton.addEventListener("click", () => {
    startNewRound();
  });
}

wireEvents();
startNewRound();
