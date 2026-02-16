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
const MIN_MODE_LIVES = 1;
const MAX_MODE_LIVES = 5;
const DEFAULT_MODE_LIVES = 3;
const LEADERBOARD_STORAGE_KEY = "worldle-competitive-leaderboard-v1";
const LEADERBOARD_LIMIT = 5;
const NEXT_COUNTRY_DELAY_MS = 1050;
const FAILURE_DELAY_MS = 1300;

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
const modePill = document.querySelector("#mode-pill");
const scorePill = document.querySelector("#score-pill");
const livesPill = document.querySelector("#lives-pill");
const roundPill = document.querySelector("#round-pill");
const modeChips = document.querySelector("#mode-chips");
const leaderboardList = document.querySelector("#leaderboard-list");
const guessRows = document.querySelector("#guess-rows");
const silhouettePath = document.querySelector("#country-shape");
const silhouetteStage = document.querySelector("#silhouette-stage");

const scoreDialog = document.querySelector("#score-dialog");
const scoreForm = document.querySelector("#score-form");
const scoreSummary = document.querySelector("#score-summary");
const playerNameInput = document.querySelector("#player-name");
const skipScoreButton = document.querySelector("#skip-score-button");

let highlightedSuggestionIndex = -1;
let visibleSuggestions = [];
let selectedSuggestionId = null;
let modeLives = DEFAULT_MODE_LIVES;
let countryNumber = 0;
let pendingRoundTimer = null;
let leaderboard = loadLeaderboard();
let run = createRun(modeLives);
let game = createRound(countries, modeLives);

function clampModeLives(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_MODE_LIVES;
  }
  return Math.min(MAX_MODE_LIVES, Math.max(MIN_MODE_LIVES, parsed));
}

function createRun(lives) {
  return {
    modeLives: lives,
    livesRemaining: lives,
    score: 0,
    status: "playing"
  };
}

function parseLeaderboardEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const score = Number.parseInt(entry.score, 10);
  const mode = clampModeLives(entry.modeLives);
  const createdAt = Number.parseInt(entry.createdAt, 10);
  const name = sanitizeName(entry.name);

  if (!Number.isFinite(score) || score < 0 || !Number.isFinite(createdAt)) {
    return null;
  }

  return {
    name,
    score,
    modeLives: mode,
    createdAt
  };
}

function sortLeaderboard(entries) {
  return entries
    .slice()
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if (a.modeLives !== b.modeLives) {
        return a.modeLives - b.modeLives;
      }

      return a.createdAt - b.createdAt;
    })
    .slice(0, LEADERBOARD_LIMIT);
}

function loadLeaderboard() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalized = parsed
      .map((entry) => parseLeaderboardEntry(entry))
      .filter(Boolean);

    return sortLeaderboard(normalized);
  } catch {
    return [];
  }
}

function saveLeaderboard() {
  localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(leaderboard));
}

function sanitizeName(value) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);

  return normalized || "Anonymous";
}

function renderLeaderboard() {
  leaderboardList.innerHTML = "";

  if (leaderboard.length === 0) {
    const empty = document.createElement("li");
    empty.className = "leaderboard-empty";
    empty.textContent = "No scores yet. Finish a run to set the first record.";
    leaderboardList.append(empty);
    return;
  }

  for (let index = 0; index < leaderboard.length; index += 1) {
    const entry = leaderboard[index];
    const item = document.createElement("li");
    item.className = "leaderboard-item";

    const rank = document.createElement("span");
    rank.className = "leader-rank";
    rank.textContent = `#${index + 1}`;

    const name = document.createElement("span");
    name.className = "leader-name";
    name.textContent = entry.name;

    const meta = document.createElement("span");
    meta.className = "leader-meta";
    const livesLabel = entry.modeLives === 1 ? "life" : "lives";
    meta.textContent = `${entry.score} pts · ${entry.modeLives} ${livesLabel}`;

    item.append(rank, name, meta);
    leaderboardList.append(item);
  }
}

function registerScore(name) {
  leaderboard = sortLeaderboard([
    ...leaderboard,
    {
      name: sanitizeName(name),
      score: run.score,
      modeLives,
      createdAt: Date.now()
    }
  ]);

  saveLeaderboard();
  renderLeaderboard();
}

function clearPendingRoundTimer() {
  if (pendingRoundTimer !== null) {
    window.clearTimeout(pendingRoundTimer);
    pendingRoundTimer = null;
  }
}

function queueNextCountry(delayMs) {
  clearPendingRoundTimer();
  pendingRoundTimer = window.setTimeout(() => {
    pendingRoundTimer = null;
    if (run.status !== "playing") {
      return;
    }
    startCountryRound({
      announce: true,
      focus: true
    });
  }, delayMs);
}

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

function renderModeChips() {
  const chips = modeChips.querySelectorAll(".mode-chip");

  for (const chip of chips) {
    const chipMode = clampModeLives(chip.dataset.mode);
    const active = chipMode === modeLives;
    chip.classList.toggle("active", active);
    chip.setAttribute("aria-checked", active ? "true" : "false");
  }
}

function updateControlState() {
  const isPlaying = run.status === "playing" && game.status === "playing";
  guessInput.disabled = !isPlaying;
  clearInputButton.disabled = !isPlaying;
  guessButton.disabled = !isPlaying;

  const guessesRemaining = Math.max(0, game.maxGuesses - game.guesses.length);
  guessesLeft.textContent = `${guessesRemaining} guess${guessesRemaining === 1 ? "" : "es"} left`;
}

function updateDashboard() {
  const livesLabel = modeLives === 1 ? "Life" : "Lives";
  modePill.textContent = `Mode ${modeLives} ${livesLabel}`;
  scorePill.textContent = `Score ${run.score}`;
  livesPill.textContent = `Lives ${run.livesRemaining}`;
  roundPill.textContent = `Country ${countryNumber}`;
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

function resetGuessInput() {
  guessInput.value = "";
  selectedSuggestionId = null;
  clearSuggestions();
}

function openScoreDialog() {
  const livesLabel = modeLives === 1 ? "life" : "lives";
  scoreSummary.textContent = `You scored ${run.score} in ${modeLives}-${livesLabel} mode.`;
  playerNameInput.value = "";

  if (typeof scoreDialog.showModal === "function") {
    if (!scoreDialog.open) {
      scoreDialog.showModal();
    }
  } else {
    scoreDialog.setAttribute("open", "");
  }

  window.setTimeout(() => {
    playerNameInput.focus();
  }, 60);
}

function closeScoreDialog() {
  if (typeof scoreDialog.close === "function") {
    if (scoreDialog.open) {
      scoreDialog.close();
    }
    return;
  }

  scoreDialog.removeAttribute("open");
}

function endRun(targetName) {
  run.status = "over";
  updateDashboard();
  updateControlState();
  setStatus(`Out of lives. ${targetName} was the last answer. Final score: ${run.score}.`, "error");
  openScoreDialog();
}

function lockGuess(country) {
  if (run.status !== "playing" || game.status !== "playing") {
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
    run.score += 1;
    game.status = "won";
    setStatus(`Correct. ${target.name} found. Score: ${run.score}. Next country loading...`, "success");
    renderGuessRows();
    updateDashboard();
    updateControlState();
    resetGuessInput();
    queueNextCountry(NEXT_COUNTRY_DELAY_MS);
    return;
  }

  if (game.guesses.length >= game.maxGuesses) {
    game.status = "lost";
    run.livesRemaining = Math.max(0, run.livesRemaining - 1);

    renderGuessRows();
    updateDashboard();
    updateControlState();
    resetGuessInput();

    if (run.livesRemaining === 0) {
      endRun(target.name);
      return;
    }

    setStatus(
      `No guesses left. It was ${target.name}. Life lost (${run.livesRemaining} left).`,
      "warning"
    );
    queueNextCountry(FAILURE_DELAY_MS);
    return;
  }

  setStatus(
    `${country.name}: ${comparison.distanceText} ${comparison.directionArrow} ${comparison.directionLabel}`,
    "info"
  );

  renderGuessRows();
  updateControlState();
  resetGuessInput();
}

function startCountryRound({ announce = true, focus = false } = {}) {
  if (run.status !== "playing") {
    return;
  }

  countryNumber += 1;
  game = createRound(countries, modeLives);

  guessRows.innerHTML = "";
  resetGuessInput();
  renderSilhouette();
  updateDashboard();
  updateControlState();

  if (announce) {
    setStatus(
      `Country ${countryNumber}. You have ${modeLives} guess${modeLives === 1 ? "" : "es"}.`,
      "info"
    );
  }

  if (focus) {
    guessInput.focus();
  }
}

function startRun(nextModeLives = modeLives) {
  clearPendingRoundTimer();
  closeScoreDialog();

  modeLives = clampModeLives(nextModeLives);
  run = createRun(modeLives);
  countryNumber = 0;

  renderModeChips();
  updateDashboard();
  startCountryRound({ announce: false, focus: true });

  setStatus(
    `Mode ${modeLives} started: ${modeLives} guesses per country and ${modeLives} total lives.`,
    "info"
  );
}

function wireEvents() {
  guessInput.addEventListener("input", () => {
    selectedSuggestionId = null;
    const suggestions = getSuggestions(guessInput.value);
    renderSuggestions(suggestions);
    setHighlightedSuggestion(-1);
  });

  guessInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      clearSuggestions();
      return;
    }

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
    }
  });

  guessInput.addEventListener("blur", () => {
    window.setTimeout(() => {
      clearSuggestions();
    }, 100);
  });

  clearInputButton.addEventListener("click", () => {
    resetGuessInput();
    guessInput.focus();
  });

  guessForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (run.status !== "playing" || game.status !== "playing") {
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
    startRun(modeLives);
  });

  modeChips.addEventListener("click", (event) => {
    const button = event.target.closest(".mode-chip");
    if (!button) {
      return;
    }

    const selectedMode = clampModeLives(button.dataset.mode);
    startRun(selectedMode);
  });

  scoreForm.addEventListener("submit", (event) => {
    event.preventDefault();
    registerScore(playerNameInput.value);
    closeScoreDialog();
    setStatus("Score saved. Press Restart Run to play again.", "success");
  });

  skipScoreButton.addEventListener("click", () => {
    closeScoreDialog();
    setStatus("Score skipped. Press Restart Run to play again.", "info");
  });

  scoreDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeScoreDialog();
  });

  scoreDialog.addEventListener("click", (event) => {
    if (event.target === scoreDialog) {
      closeScoreDialog();
    }
  });
}

renderLeaderboard();
wireEvents();
startRun(DEFAULT_MODE_LIVES);
