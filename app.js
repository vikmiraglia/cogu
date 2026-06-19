const TOTAL_CARDS = 60;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const BACK_CARD = "assets/cards/61.png";

const state = {
  players: ["Jogador 1", "Jogador 2"],
  currentPlayerIndex: 0,
  deck: [],
  drawnCount: 0,
  currentCard: null,
  history: [],
  soundEnabled: true,
  confirmDraw: false,
  deferredInstallPrompt: null,
  audioContext: null,
};

const $ = (id) => document.getElementById(id);

const screens = {
  setup: $("setupScreen"),
  game: $("gameScreen"),
  lose: $("loseScreen"),
};

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  screens[name].classList.add("active");
}

function randomFloat() {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] / 2 ** 32;
}

function randomInt(maxExclusive) {
  return Math.floor(randomFloat() * maxExclusive);
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getLossChance(drawNumber) {
  if (drawNumber <= 10) return 0.01;
  const progress = (drawNumber - 10) / (TOTAL_CARDS - 10);
  return 0.01 + progress * 0.04;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(value < 0.02 ? 1 : 0).replace(".0", "")}%`;
}

function savePlayers() {
  localStorage.setItem("cogu.players", JSON.stringify(state.players));
}

function savePrefs() {
  localStorage.setItem("cogu.preferences", JSON.stringify({
    soundEnabled: state.soundEnabled,
    confirmDraw: state.confirmDraw,
  }));
}

function loadPlayers() {
  try {
    const saved = JSON.parse(localStorage.getItem("cogu.players"));
    if (Array.isArray(saved) && saved.length >= MIN_PLAYERS) {
      state.players = saved.slice(0, MAX_PLAYERS).map((name, index) => {
        const clean = String(name || "").trim();
        return clean || `Jogador ${index + 1}`;
      });
    }
  } catch {}
}

function loadPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem("cogu.preferences"));
    if (prefs && typeof prefs === "object") {
      state.soundEnabled = !!prefs.soundEnabled;
      state.confirmDraw = !!prefs.confirmDraw;
    }
  } catch {}
}

function applyPrefsToUI() {
  $("soundToggle").checked = state.soundEnabled;
  $("confirmToggle").checked = state.confirmDraw;
}

function ensureAudio() {
  if (state.audioContext || !state.soundEnabled) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  state.audioContext = new AudioCtx();
}

function playTone(type = "draw") {
  if (!state.soundEnabled) return;
  try {
    ensureAudio();
    const ctx = state.audioContext;
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type === "lose" ? "sawtooth" : "triangle";

    if (type === "lose") {
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.35);
    } else {
      osc.frequency.setValueAtTime(430, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.18);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(type === "lose" ? 0.18 : 0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (type === "lose" ? 0.52 : 0.24));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (type === "lose" ? 0.54 : 0.26));
  } catch {}
}

function renderPlayersSetup() {
  const list = $("playersList");
  list.innerHTML = "";

  state.players.forEach((player, index) => {
    const row = document.createElement("div");
    row.className = "player-row";

    const badge = document.createElement("div");
    badge.className = "player-number";
    badge.textContent = index + 1;

    const input = document.createElement("input");
    input.value = player;
    input.maxLength = 24;
    input.placeholder = `Jogador ${index + 1}`;
    input.addEventListener("input", () => {
      state.players[index] = input.value.trim() || `Jogador ${index + 1}`;
      savePlayers();
      renderPlayersStrip();
    });

    const remove = document.createElement("button");
    remove.className = "remove-player";
    remove.type = "button";
    remove.textContent = "×";
    remove.title = "Remover jogador";
    remove.disabled = state.players.length <= MIN_PLAYERS;
    remove.addEventListener("click", () => {
      if (state.players.length <= MIN_PLAYERS) return;
      state.players.splice(index, 1);
      savePlayers();
      renderPlayersSetup();
    });

    row.append(badge, input, remove);
    list.appendChild(row);
  });

  $("playerCountBadge").textContent = `${state.players.length} / ${MAX_PLAYERS}`;
  $("addPlayerBtn").disabled = state.players.length >= MAX_PLAYERS;
}

function renderPlayersStrip() {
  const strip = $("playersStrip");
  strip.innerHTML = "";

  state.players.forEach((player, index) => {
    const chip = document.createElement("div");
    chip.className = `player-chip ${index === state.currentPlayerIndex ? "active" : ""}`;
    chip.textContent = player;
    strip.appendChild(chip);
  });
}

function renderHistory() {
  const historyEl = $("historyList");
  historyEl.innerHTML = "";

  if (!state.history.length) {
    historyEl.className = "history-list empty";
    historyEl.textContent = "Nenhuma carta foi puxada ainda.";
    return;
  }

  historyEl.className = "history-list";

  [...state.history].reverse().forEach((item) => {
    const row = document.createElement("div");
    row.className = "history-item";

    const img = document.createElement("img");
    img.src = `assets/cards/${item.card}.png`;
    img.alt = `Carta ${item.card}`;

    const text = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = `Carta ${item.card}`;
    const meta = document.createElement("span");
    meta.textContent = `${item.player} — puxada ${item.drawNumber}`;
    text.append(strong, meta);

    const risk = document.createElement("span");
    risk.textContent = item.risk;

    row.append(img, text, risk);
    historyEl.appendChild(row);
  });
}

function updateGameUI() {
  const current = state.players[state.currentPlayerIndex] || "Jogador";
  const nextDraw = Math.min(state.drawnCount + 1, TOTAL_CARDS);
  const chance = getLossChance(nextDraw);
  const remaining = TOTAL_CARDS - state.drawnCount;
  const round = Math.floor(state.drawnCount / Math.max(1, state.players.length)) + 1;

  $("currentPlayerName").textContent = current;
  $("deckCounter").textContent = `${state.drawnCount} / ${TOTAL_CARDS}`;
  $("remainingCounter").textContent = remaining;
  $("riskCounter").textContent = formatPercent(chance);
  $("roundCounter").textContent = round;
  $("progressFill").style.width = `${(state.drawnCount / TOTAL_CARDS) * 100}%`;

  renderPlayersStrip();
  renderHistory();
}

function resetCardVisual() {
  $("flipCard").classList.remove("flipped");
  $("cardImage").src = BACK_CARD;
}

function newGame() {
  state.currentPlayerIndex = 0;
  state.deck = shuffle(Array.from({ length: TOTAL_CARDS }, (_, i) => i + 1));
  state.drawnCount = 0;
  state.currentCard = null;
  state.history = [];

  resetCardVisual();

  $("drawBtn").classList.remove("hidden");
  $("nextTurnBtn").classList.add("hidden");
  $("instructionText").textContent = "Toque no botão para puxar a próxima carta.";
  $("statusMessage").textContent = "O jogador da vez deve puxar a carta e ler em voz alta.";

  updateGameUI();
}

function handleLoss(drawNumber, playerName) {
  playTone("lose");
  $("loserText").textContent = `${playerName} perdeu ao puxar a carta ${drawNumber}.`;
  setTimeout(() => showScreen("lose"), 160);
}

function drawCard() {
  ensureAudio();

  if (!state.deck.length) {
    $("instructionText").textContent = "Todas as cartas já foram usadas.";
    $("statusMessage").textContent = "Reinicie o jogo para embaralhar o baralho novamente.";
    $("drawBtn").classList.add("hidden");
    $("nextTurnBtn").classList.add("hidden");
    return;
  }

  if (state.confirmDraw) {
    const ok = confirm("Confirmar puxar a próxima carta?");
    if (!ok) return;
  }

  const drawNumber = state.drawnCount + 1;
  const chance = getLossChance(drawNumber);
  const playerName = state.players[state.currentPlayerIndex];

  if (randomFloat() < chance) {
    handleLoss(drawNumber, playerName);
    return;
  }

  const cardNumber = state.deck.shift();
  state.currentCard = cardNumber;
  state.drawnCount = drawNumber;

  $("cardImage").src = `assets/cards/${cardNumber}.png`;
  requestAnimationFrame(() => $("flipCard").classList.add("flipped"));

  state.history.push({
    card: cardNumber,
    player: playerName,
    drawNumber,
    risk: formatPercent(chance),
  });

  playTone("draw");

  $("instructionText").textContent = `${playerName}, leia a carta para o grupo e faça o que ela diz.`;
  $("statusMessage").textContent = "Quando terminar, toque em “Próximo jogador”.";
  $("drawBtn").classList.add("hidden");
  $("nextTurnBtn").classList.remove("hidden");

  updateGameUI();
}

function nextTurn() {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.currentCard = null;

  resetCardVisual();
  $("instructionText").textContent = "Toque no botão para puxar a próxima carta.";
  $("statusMessage").textContent = "O jogador da vez deve puxar a carta e ler em voz alta.";
  $("drawBtn").classList.remove("hidden");
  $("nextTurnBtn").classList.add("hidden");

  updateGameUI();
}

function startGame() {
  state.players = state.players
    .map((name, index) => String(name || "").trim() || `Jogador ${index + 1}`)
    .slice(0, MAX_PLAYERS);

  if (state.players.length < MIN_PLAYERS) {
    alert("Adicione pelo menos 2 jogadores.");
    return;
  }

  savePlayers();
  savePrefs();
  newGame();
  showScreen("game");
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      $("fullscreenBtn").textContent = "Sair da tela cheia";
    } else {
      await document.exitFullscreen();
      $("fullscreenBtn").textContent = "Tela cheia";
    }
  } catch {}
}

function bindEvents() {
  $("addPlayerBtn").addEventListener("click", () => {
    if (state.players.length >= MAX_PLAYERS) return;
    state.players.push(`Jogador ${state.players.length + 1}`);
    savePlayers();
    renderPlayersSetup();
  });

  $("startBtn").addEventListener("click", startGame);
  $("drawBtn").addEventListener("click", drawCard);
  $("nextTurnBtn").addEventListener("click", nextTurn);

  $("backToSetupBtn").addEventListener("click", () => {
    showScreen("setup");
    renderPlayersSetup();
  });

  $("resetBtn").addEventListener("click", () => {
    if (confirm("Reiniciar o jogo com os mesmos jogadores?")) {
      newGame();
    }
  });

  $("restartAfterLossBtn").addEventListener("click", () => {
    newGame();
    showScreen("game");
  });

  $("rulesBtn").addEventListener("click", () => $("rulesDialog").showModal());
  $("historyBtn").addEventListener("click", () => {
    renderHistory();
    $("historyDialog").showModal();
  });

  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => $(button.dataset.close).close());
  });

  $("soundToggle").addEventListener("change", (e) => {
    state.soundEnabled = e.target.checked;
    savePrefs();
  });

  $("confirmToggle").addEventListener("change", (e) => {
    state.confirmDraw = e.target.checked;
    savePrefs();
  });

  $("fullscreenBtn").addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => {
    $("fullscreenBtn").textContent = document.fullscreenElement ? "Sair da tela cheia" : "Tela cheia";
  });

  $("installBtn").addEventListener("click", async () => {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    $("installBtn").classList.add("hidden");
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    $("installBtn").classList.remove("hidden");
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

loadPlayers();
loadPrefs();
applyPrefsToUI();
renderPlayersSetup();
renderPlayersStrip();
renderHistory();
updateGameUI();
bindEvents();
