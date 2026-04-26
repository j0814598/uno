// UI layer — renders state and handles input.

let state = null;

const els = {
  cpuHand: document.getElementById("cpuHand"),
  cpuCount: document.getElementById("cpuCount"),
  playerHand: document.getElementById("playerHand"),
  playerCount: document.getElementById("playerCount"),
  discard: document.getElementById("discardPile"),
  dirArrow: document.getElementById("dirArrow"),
  deckBtn: document.getElementById("deckBtn"),
  status: document.getElementById("status"),
  turnIndicator: document.getElementById("turnIndicator"),
  newGameBtn: document.getElementById("newGameBtn"),
  unoBtn: document.getElementById("unoBtn"),
  passBtn: document.getElementById("passBtn"),
  colorPicker: document.getElementById("colorPicker"),
  resultModal: document.getElementById("resultModal"),
  resultText: document.getElementById("resultText"),
  resultTitle: document.getElementById("resultTitle"),
  playAgainBtn: document.getElementById("playAgainBtn"),
  toast: document.getElementById("toast"),
};

const SYMBOL = {
  skip: "🚫",
  reverse: "🔄",
  draw2: "+2",
  wild: "★",
  wild4: "+4",
};

const COLOR_LABEL = { red: "あか", yellow: "きいろ", green: "みどり", blue: "あお" };

function cardEl(card, opts = {}) {
  const el = document.createElement("div");
  el.className = "card";
  el.dataset.color = card.color;

  if (card.kind === "number") {
    const n = document.createElement("div");
    n.className = "num";
    n.textContent = card.value;
    el.appendChild(n);
    addCorners(el, card.value);
  } else if (card.kind === "action") {
    const s = document.createElement("div");
    s.className = "symbol";
    s.textContent = SYMBOL[card.value];
    el.appendChild(s);
    addCorners(el, SYMBOL[card.value]);
  } else if (card.kind === "wild") {
    const s = document.createElement("div");
    s.className = "symbol";
    s.textContent = card.value === "wild4" ? "+4" : "★";
    el.appendChild(s);
    addCorners(el, card.value === "wild4" ? "+4" : "★");
  }

  if (opts.back) {
    el.classList.add("back");
    el.removeAttribute("data-color");
    el.innerHTML = "";
  }
  return el;
}

function addCorners(el, txt) {
  const tl = document.createElement("div");
  tl.className = "corner tl";
  tl.textContent = txt;
  const br = document.createElement("div");
  br.className = "corner br";
  br.textContent = txt;
  el.appendChild(tl);
  el.appendChild(br);
}

function render() {
  // CPU hand (face-down)
  els.cpuHand.innerHTML = "";
  state.hands.cpu.forEach(() => {
    els.cpuHand.appendChild(cardEl({}, { back: true }));
  });
  els.cpuCount.textContent = state.hands.cpu.length;

  // Player hand
  els.playerHand.innerHTML = "";
  const top = state.discard[state.discard.length - 1];
  const isPlayerTurn = state.turn === "player" && !state.over;
  state.hands.player.forEach((card, i) => {
    const el = cardEl(card);
    let playable = isPlayerTurn && UNO.canPlay(card, top, state.currentColor);
    if (playable && card.kind === "wild" && card.value === "wild4" &&
        !UNO.canPlayWild4(state.hands.player, state.currentColor)) {
      playable = false;
    }
    el.classList.add(playable ? "playable" : "unplayable");
    el.addEventListener("click", () => onPlayerCardClick(i));
    els.playerHand.appendChild(el);
  });
  els.playerCount.textContent = state.hands.player.length;

  // Discard
  els.discard.innerHTML = "";
  els.discard.appendChild(cardEl(top));
  // recolor wilds via outer ring class
  els.discard.classList.remove("color-red", "color-yellow", "color-green", "color-blue");
  if (state.currentColor) els.discard.classList.add("color-" + state.currentColor);

  // direction
  els.dirArrow.classList.toggle("reverse", state.direction === -1);

  // turn
  els.turnIndicator.classList.toggle("your-turn", isPlayerTurn);
  els.turnIndicator.textContent = state.over
    ? "おわり"
    : isPlayerTurn ? "あなたのばん" : "CPUのばん";

  // status — show last log line
  els.status.textContent = state.log[state.log.length - 1] || "";

  // UNO button visible only when player has 2 cards (about to play to 1) or just played to 1
  const playerCards = state.hands.player.length;
  els.unoBtn.hidden = !(isPlayerTurn && playerCards <= 2);
}

function onPlayerCardClick(i) {
  if (state.turn !== "player" || state.over) return;
  const card = state.hands.player[i];
  const top = state.discard[state.discard.length - 1];
  if (!UNO.canPlay(card, top, state.currentColor)) {
    toast("そのカードはだせないよ");
    return;
  }
  if (card.kind === "wild" && card.value === "wild4" && !UNO.canPlayWild4(state.hands.player, state.currentColor)) {
    toast("+4は おなじいろがないときだけ");
    return;
  }
  if (card.kind === "wild") {
    askColor(color => doPlay(i, color));
  } else {
    doPlay(i, null);
  }
}

function doPlay(i, color) {
  const card = state.hands.player[i];
  const willHaveOne = state.hands.player.length === 2;
  const result = UNO.playCard(state, "player", i, color);
  if (!result.ok) { toast(result.reason); return; }
  log(`あなた: ${describeCard(card)}${color ? ` → ${COLOR_LABEL[color]}` : ""}`);
  if (willHaveOne && !state.unoCalled.player) {
    // Give a small grace window before CPU acts; if not called, CPU triggers penalty.
  }
  render();
  if (state.over) { showResult(); return; }
  if (state.turn === "cpu") setTimeout(cpuTurn, 700);
}

function askColor(cb) {
  els.colorPicker.classList.remove("hidden");
  const handlers = {};
  els.colorPicker.querySelectorAll(".color-choice").forEach(b => {
    handlers[b.dataset.color] = () => {
      els.colorPicker.classList.add("hidden");
      els.colorPicker.querySelectorAll(".color-choice").forEach(bb => bb.replaceWith(bb.cloneNode(true)));
      cb(b.dataset.color);
    };
    b.addEventListener("click", handlers[b.dataset.color], { once: true });
  });
}

function onDeckClick() {
  if (state.turn !== "player" || state.over) return;
  const r = UNO.drawForTurn(state, "player");
  if (!r.ok) { toast(r.reason); return; }
  log(`あなた: 1まいひいた`);
  // If drawn card is playable, allow optional play; for simplicity (kid-friendly),
  // we auto-pass to CPU. Player can play next turn.
  // (Keeping it simple matches common house behavior; will revisit if needed.)
  // Move turn to CPU.
  state.turn = "cpu";
  render();
  setTimeout(cpuTurn, 700);
}

function cpuTurn() {
  if (state.over || state.turn !== "cpu") return;

  // Penalty: if player ended last turn at 1 card without calling UNO.
  if (state.awaitingUnoCall && state.hands.player.length === 1 && !state.unoCalled.player) {
    UNO.checkUnoPenalty(state, "player");
    toast("UNOをいわなかった！ ペナルティで2まい");
    state.awaitingUnoCall = false;
    render();
  }

  const move = AI.chooseCpuMove(state);
  if (move.type === "draw") {
    const r = UNO.drawForTurn(state, "cpu");
    if (!r.ok) {
      log("CPU: ひけない");
      state.turn = "player";
      render();
      return;
    }
    log("CPU: 1まいひいた");
    // Try to play the drawn card if legal.
    const top = state.discard[state.discard.length - 1];
    const newIdx = state.hands.cpu.length - 1;
    const drawn = state.hands.cpu[newIdx];
    if (UNO.canPlay(drawn, top, state.currentColor) &&
        !(drawn.kind === "wild" && drawn.value === "wild4" && !UNO.canPlayWild4(state.hands.cpu, state.currentColor))) {
      const chosen = drawn.kind === "wild" ? bestColorFor("cpu") : null;
      const willHaveOne = state.hands.cpu.length === 1;
      UNO.playCard(state, "cpu", newIdx, chosen);
      if (willHaveOne) UNO.callUno(state, "cpu"); // CPU always calls UNO
      log(`CPU: ${describeCard(drawn)}${chosen ? ` → ${COLOR_LABEL[chosen]}` : ""}`);
      render();
      if (state.over) return showResult();
      if (state.turn === "cpu") return setTimeout(cpuTurn, 700);
      return;
    }
    state.turn = "player";
    render();
    return;
  }

  // Play a card
  const card = state.hands.cpu[move.idx];
  const willHaveOne = state.hands.cpu.length === 2; // about to drop to 1
  const r = UNO.playCard(state, "cpu", move.idx, move.chosenColor);
  if (!r.ok) { state.turn = "player"; render(); return; }
  if (willHaveOne) {
    UNO.callUno(state, "cpu");
    toast("CPU: UNO!");
  }
  log(`CPU: ${describeCard(card)}${move.chosenColor ? ` → ${COLOR_LABEL[move.chosenColor]}` : ""}`);
  render();
  if (state.over) return showResult();
  if (state.turn === "cpu") setTimeout(cpuTurn, 700);
}

function bestColorFor(who) {
  const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of state.hands[who]) if (c.color in counts) counts[c.color]++;
  let best = "red", bn = -1;
  for (const k of Object.keys(counts)) if (counts[k] > bn) { bn = counts[k]; best = k; }
  return best;
}

function describeCard(c) {
  if (c.kind === "number") return `${COLOR_LABEL[c.color]} ${c.value}`;
  if (c.kind === "action") {
    const name = c.value === "skip" ? "スキップ" : c.value === "reverse" ? "リバース" : "ドロー2";
    return `${COLOR_LABEL[c.color]} ${name}`;
  }
  if (c.kind === "wild") return c.value === "wild4" ? "ワイルド+4" : "ワイルド";
  return "";
}

function log(msg) {
  state.log.push(msg);
  if (state.log.length > 50) state.log.shift();
}

let toastTimer = null;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 1600);
}

function showResult() {
  els.resultTitle.textContent = state.winner === "player" ? "かち！🎉" : "まけ…";
  els.resultText.textContent = state.winner === "player" ? "やったね！" : "つぎはがんばろう！";
  els.resultModal.classList.remove("hidden");
}

function startNewGame() {
  state = UNO.newGame();
  els.resultModal.classList.add("hidden");
  // Handle first-card wild requiring color choice
  if (state.awaitingColor && state.firstWildChooser === "player") {
    askColor(color => {
      state.currentColor = color;
      state.awaitingColor = false;
      render();
    });
  }
  render();
  if (state.turn === "cpu") setTimeout(cpuTurn, 800);
}

// Wire up
els.deckBtn.addEventListener("click", onDeckClick);
els.newGameBtn.addEventListener("click", startNewGame);
els.playAgainBtn.addEventListener("click", startNewGame);
els.unoBtn.addEventListener("click", () => {
  if (state.hands.player.length === 1 || state.hands.player.length === 2) {
    UNO.callUno(state, "player");
    toast("UNO!");
    render();
  }
});

startNewGame();
