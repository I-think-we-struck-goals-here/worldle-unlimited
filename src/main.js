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
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 5;
const DEFAULT_DIFFICULTY = 3;
const LEADERBOARD_STORAGE_KEY = "worldle-competitive-leaderboard-v2";
const LEADERBOARD_LIMIT = 5;

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
const difficultyPill = document.querySelector("#difficulty-pill");
const scorePill = document.querySelector("#score-pill");
const modeChips = document.querySelector("#mode-chips");
const leaderboardList = document.querySelector("#leaderboard-list");
const guessRows = document.querySelector("#guess-rows");
const silhouettePath = document.querySelector("#country-shape");

const scoreDialog = document.querySelector("#score-dialog");
const scoreForm = document.querySelector("#score-form");
const scoreSummary = document.querySelector("#score-summary");
const playerNameInput = document.querySelector("#player-name");
const skipScoreButton = document.querySelector("#skip-score-button");

let highlightedSuggestionIndex = -1;
let visibleSuggestions = [];
let selectedSuggestionId = null;
let selectedDifficulty = DEFAULT_DIFFICULTY;
let difficulty = DEFAULT_DIFFICULTY;
let countryNumber = 0;
let leaderboard = loadLeaderboard();
let run = createRun();
let game = createRound(countries, difficulty);

function clampDifficulty(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_DIFFICULTY;
  }

  return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, parsed));
}

function createRun() {
  return {
    score: 0,
    status: "playing"
  };
}

function sanitizeName(value) {
  const normalized = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);

  return normalized || "Anonymous";
}

function parseLeaderboardEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const score = Number.parseInt(entry.score, 10);
  const createdAt = Number.parseInt(entry.createdAt, 10);
  const parsedDifficulty = clampDifficulty(entry.difficulty ?? entry.modeLives);

  if (!Number.isFinite(score) || score < 0 || !Number.isFinite(createdAt)) {
    return null;
  }

  return {
    name: sanitizeName(entry.name),
    score,
    difficulty: parsedDifficulty,
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

      if (a.difficulty !== b.difficulty) {
        return a.difficulty - b.difficulty;
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
    const guessLabel = entry.difficulty === 1 ? "guess" : "guesses";
    meta.textContent = `${entry.score} pts · D${entry.difficulty} ${guessLabel}`;

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
      difficulty,
      createdAt: Date.now()
    }
  ]);

  saveLeaderboard();
  renderLeaderboard();
}

function getTargetCountry() {
  return countriesById.get(game.targetId);
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
    const chipDifficulty = clampDifficulty(chip.dataset.mode);
    const active = chipDifficulty === selectedDifficulty;
    chip.classList.toggle("active", active);
    chip.setAttribute("aria-checked", active ? "true" : "false");
  }
}

function updateDashboard() {
  const guessLabel = difficulty === 1 ? "guess" : "guesses";
  difficultyPill.textContent = `Difficulty ${difficulty} · ${difficulty} ${guessLabel}`;
  scorePill.textContent = `Streak ${run.score}`;
}

function updateControlState() {
  if (run.status === "over") {
    guessInput.disabled = true;
    clearInputButton.disabled = true;
    guessButton.disabled = true;
    guessButton.textContent = "Run Over";
    guessesLeft.textContent = "Run ended";
    return;
  }

  if (game.status === "won") {
    guessInput.disabled = true;
    clearInputButton.disabled = true;
    guessButton.disabled = false;
    guessButton.textContent = "Next Country";
    guessesLeft.textContent = "Solved - continue";
    return;
  }

  guessInput.disabled = false;
  clearInputButton.disabled = false;
  guessButton.disabled = false;
  guessButton.textContent = "Submit Guess";

  const guessesRemaining = Math.max(0, game.maxGuesses - game.guesses.length);
  guessesLeft.textContent = `${guessesRemaining} guess${guessesRemaining === 1 ? "" : "es"} left`;
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
  scoreSummary.textContent = `Final streak: ${run.score} on difficulty ${difficulty}.`;
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
  setStatus(`Run over. ${targetName} was the answer. Final streak ${run.score}.`, "error");
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

    renderGuessRows();
    updateDashboard();
    updateControlState();
    resetGuessInput();

    setStatus(`Correct: ${target.name}. Streak ${run.score}. Press Next Country.`, "success");
    return;
  }

  renderGuessRows();
  updateControlState();
  resetGuessInput();

  if (game.guesses.length >= game.maxGuesses) {
    game.status = "lost";
    endRun(target.name);
    return;
  }

  setStatus(
    `${country.name}: ${comparison.distanceText} ${comparison.directionArrow} ${comparison.directionLabel}`,
    "info"
  );
}

function startCountryRound({ announce = true, focus = false } = {}) {
  if (run.status !== "playing") {
    return;
  }

  countryNumber += 1;
  game = createRound(countries, difficulty);

  guessRows.innerHTML = "";
  resetGuessInput();
  renderSilhouette();
  updateControlState();

  if (announce) {
    setStatus(
      `Country ${countryNumber}: ${difficulty} guess${difficulty === 1 ? "" : "es"} max.`,
      "info"
    );
  }

  if (focus) {
    guessInput.focus();
  }
}

function startRun() {
  closeScoreDialog();

  difficulty = selectedDifficulty;
  run = createRun();
  countryNumber = 0;

  renderModeChips();
  updateDashboard();
  startCountryRound({ announce: false, focus: true });

  setStatus(
    `Run started. One life. ${difficulty} guess${difficulty === 1 ? "" : "es"} per country.`,
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

    if (run.status === "over") {
      return;
    }

    if (game.status === "won") {
      startCountryRound({ announce: true, focus: true });
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
    startRun();
  });

  modeChips.addEventListener("click", (event) => {
    const button = event.target.closest(".mode-chip");
    if (!button) {
      return;
    }

    selectedDifficulty = clampDifficulty(button.dataset.mode);
    renderModeChips();

    if (selectedDifficulty === difficulty) {
      setStatus(`Difficulty ${selectedDifficulty} is active.`, "info");
      return;
    }

    setStatus(
      `Difficulty ${selectedDifficulty} selected. Press Restart Run to apply.`,
      "info"
    );
  });

  scoreForm.addEventListener("submit", (event) => {
    event.preventDefault();
    registerScore(playerNameInput.value);
    closeScoreDialog();
    setStatus("Score saved. Choose a difficulty, then press Restart Run.", "success");
  });

  skipScoreButton.addEventListener("click", () => {
    closeScoreDialog();
    setStatus("Score skipped. Press Restart Run when ready.", "info");
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
renderModeChips();
wireEvents();
startRun();
