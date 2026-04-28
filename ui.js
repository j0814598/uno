// UI layer — renders state and handles input.

let state = null;
let numPlayers = 2;

const els = {
  cpuArea: document.getElementById("cpuArea"),
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
  countSelector: document.getElementById("countSelector"),
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

function isHumanTurn() {
  return !!state && !state.over && state.turnIdx === 0;
}

function render() {
  if (!state) return;

  // CPU areas
  els.cpuArea.innerHTML = "";
  state.players.forEach((p, idx) => {
    if (!p.isCpu) return;
    const slot = document.createElement("section");
    slot.className = "cpu-slot";
    if (state.turnIdx === idx && !state.over) slot.classList.add("active");

    const label = document.createElement("div");
    label.className = "player-label";
    label.innerHTML = `${p.name}<span class="count">${p.hand.length}</span>`;
    slot.appendChild(label);

    const hand = document.createElement("div");
    hand.className = "hand cpu-hand";
    p.hand.forEach(() => hand.appendChild(cardEl({}, { back: true })));
    slot.appendChild(hand);
    els.cpuArea.appendChild(slot);
  });

  // Player hand (always index 0)
  const me = state.players[0];
  els.playerHand.innerHTML = "";
  const top = state.discard[state.discard.length - 1];
  const myTurn = isHumanTurn();
  me.hand.forEach((card, i) => {
    const el = cardEl(card);
    let playable = myTurn && UNO.canPlay(card, top, state.currentColor);
    if (playable && card.kind === "wild" && card.value === "wild4" &&
        !UNO.canPlayWild4(me.hand, state.currentColor)) {
      playable = false;
    }
    el.classList.add(playable ? "playable" : "unplayable");
    el.addEventListener("click", () => onPlayerCardClick(i));
    els.playerHand.appendChild(el);
  });
  els.playerCount.textContent = me.hand.length;

  // Discard
  els.discard.innerHTML = "";
  els.discard.appendChild(cardEl(top));
  els.discard.classList.remove("color-red", "color-yellow", "color-green", "color-blue");
  if (state.currentColor) els.discard.classList.add("color-" + state.currentColor);

  // direction
  els.dirArrow.classList.toggle("reverse", state.direction === -1);

  // turn
  const cur = state.players[state.turnIdx];
  els.turnIndicator.classList.toggle("your-turn", myTurn);
  els.turnIndicator.textContent = state.over
    ? "おわり"
    : myTurn ? "あなたのばん" : `${cur.name}のばん`;

  // status — show last log line
  els.status.textContent = state.log[state.log.length - 1] || "";

  // UNO button visible only when player has 2 cards (about to play to 1) or just played to 1
  els.unoBtn.hidden = !(myTurn && me.hand.length <= 2);
}

function onPlayerCardClick(i) {
  if (!isHumanTurn()) return;
  const me = state.players[0];
  const card = me.hand[i];
  const top = state.discard[state.discard.length - 1];
  if (!UNO.canPlay(card, top, state.currentColor)) {
    toast("そのカードはだせないよ");
    return;
  }
  if (card.kind === "wild" && card.value === "wild4" && !UNO.canPlayWild4(me.hand, state.currentColor)) {
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
  const me = state.players[0];
  const card = me.hand[i];
  const result = UNO.playCard(state, 0, i, color);
  if (!result.ok) { toast(result.reason); return; }
  log(`あなた: ${describeCard(card)}${color ? ` → ${COLOR_LABEL[color]}` : ""}`);
  render();
  if (state.over) { showResult(); return; }
  scheduleNextTurn();
}

function scheduleNextTurn() {
  if (!state || state.over) return;
  const cur = state.players[state.turnIdx];
  if (cur.isCpu) setTimeout(() => cpuTurn(state.turnIdx), 700);
}

function askColor(cb) {
  els.colorPicker.classList.remove("hidden");
  els.colorPicker.querySelectorAll(".color-choice").forEach(b => {
    const fresh = b.cloneNode(true);
    b.replaceWith(fresh);
  });
  els.colorPicker.querySelectorAll(".color-choice").forEach(b => {
    b.addEventListener("click", () => {
      els.colorPicker.classList.add("hidden");
      cb(b.dataset.color);
    }, { once: true });
  });
}

function onDeckClick() {
  if (!isHumanTurn()) return;
  const r = UNO.drawForTurn(state, 0);
  if (!r.ok) { toast(r.reason); return; }
  log(`あなた: 1まいひいた`);
  // Pass the turn to the next player (kid-friendly: no auto-play of drawn card).
  state.turnIdx = UNO.peekNext(state);
  render();
  scheduleNextTurn();
}

function cpuTurn(idx) {
  if (!state || state.over || state.turnIdx !== idx) return;
  const cpu = state.players[idx];

  // Penalty: human ended at 1 card without calling UNO.
  if (state.awaitingUnoCall) {
    const me = state.players[0];
    if (me.hand.length === 1 && !me.unoCalled) {
      UNO.checkUnoPenalty(state, 0);
      toast("UNOをいわなかった！ ペナルティで2まい");
    }
    state.awaitingUnoCall = false;
    render();
  }

  const move = AI.chooseCpuMove(state, idx);
  if (move.type === "draw") {
    const r = UNO.drawForTurn(state, idx);
    if (!r.ok) {
      log(`${cpu.name}: ひけない`);
      state.turnIdx = UNO.peekNext(state, idx);
      render();
      scheduleNextTurn();
      return;
    }
    log(`${cpu.name}: 1まいひいた`);
    const top = state.discard[state.discard.length - 1];
    const newIdx = cpu.hand.length - 1;
    const drawn = cpu.hand[newIdx];
    if (UNO.canPlay(drawn, top, state.currentColor) &&
        !(drawn.kind === "wild" && drawn.value === "wild4" && !UNO.canPlayWild4(cpu.hand, state.currentColor))) {
      const chosen = drawn.kind === "wild" ? bestColorFor(idx) : null;
      const willHaveOne = cpu.hand.length === 2;
      UNO.playCard(state, idx, newIdx, chosen);
      if (willHaveOne) { UNO.callUno(state, idx); toast(`${cpu.name}: UNO!`); }
      log(`${cpu.name}: ${describeCard(drawn)}${chosen ? ` → ${COLOR_LABEL[chosen]}` : ""}`);
      render();
      if (state.over) return showResult();
      scheduleNextTurn();
      return;
    }
    state.turnIdx = UNO.peekNext(state, idx);
    render();
    scheduleNextTurn();
    return;
  }

  // Play a card
  const card = cpu.hand[move.idx];
  const willHaveOne = cpu.hand.length === 2;
  const r = UNO.playCard(state, idx, move.idx, move.chosenColor);
  if (!r.ok) {
    state.turnIdx = UNO.peekNext(state, idx);
    render();
    scheduleNextTurn();
    return;
  }
  if (willHaveOne) {
    UNO.callUno(state, idx);
    toast(`${cpu.name}: UNO!`);
  }
  log(`${cpu.name}: ${describeCard(card)}${move.chosenColor ? ` → ${COLOR_LABEL[move.chosenColor]}` : ""}`);
  render();
  if (state.over) return showResult();
  scheduleNextTurn();
}

function bestColorFor(idx) {
  const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of state.players[idx].hand) if (c.color in counts) counts[c.color]++;
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
  const winner = state.players[state.winner];
  const youWin = !winner.isCpu;
  els.resultTitle.textContent = youWin ? "かち！🎉" : "まけ…";
  els.resultText.textContent = youWin
    ? "やったね！"
    : `${winner.name}のかち！ つぎはがんばろう！`;
  els.resultModal.classList.remove("hidden");
}

function startNewGame(n) {
  if (n) numPlayers = n;
  state = UNO.newGame(numPlayers);
  els.resultModal.classList.add("hidden");

  if (state.awaitingColor && state.firstWildChooser === 0) {
    askColor(color => {
      state.currentColor = color;
      state.awaitingColor = false;
      render();
      scheduleNextTurn();
    });
  } else if (state.awaitingColor) {
    // CPU starts on a wild — let them pick best color silently.
    state.currentColor = bestColorFor(state.firstWildChooser);
    state.awaitingColor = false;
  }
  render();
  scheduleNextTurn();
}

function showCountSelector() {
  els.resultModal.classList.add("hidden");
  els.countSelector.classList.remove("hidden");
}

// Wire up
els.deckBtn.addEventListener("click", onDeckClick);
els.newGameBtn.addEventListener("click", showCountSelector);
els.playAgainBtn.addEventListener("click", showCountSelector);
els.unoBtn.addEventListener("click", () => {
  if (!state) return;
  const me = state.players[0];
  if (me.hand.length === 1 || me.hand.length === 2) {
    UNO.callUno(state, 0);
    toast("UNO!");
    render();
  }
});
els.countSelector.querySelectorAll(".count-choice").forEach(b => {
  b.addEventListener("click", () => {
    const n = parseInt(b.dataset.count, 10);
    els.countSelector.classList.add("hidden");
    startNewGame(n);
  });
});

// Initial: show selector before starting.
showCountSelector();
