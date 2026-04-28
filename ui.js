// UI layer — renders state and handles input.

let state = null;
let numPlayers = 2;

const els = {
  cpuArea: document.getElementById("cpuArea"),
  playerHand: document.getElementById("playerHand"),
  playerCount: document.getElementById("playerCount"),
  discard: document.getElementById("discardPile"),
  dirArrow: document.getElementById("dirArrow"),
  dirLabel: document.getElementById("dirLabel"),
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

const TIMING = {
  thinking: 750,        // CPU pause before acting (also UNO grace window)
  cpuPlay: 480,         // CPU card flying to discard
  cpuDraw: 480,         // CPU card flying from deck to hand
  cpuDrawThenPlay: 250, // pause between draw and follow-up play
  playerPlay: 260,      // player's card flying to discard
  playerDraw: 260,      // player drawing from deck
  betweenTurns: 380,    // delay before next CPU turn starts
  penaltyEach: 360,     // each forced-draw card's flight time
  penaltyGap: 110,      // stagger between forced-draw cards
};

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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getCpuSlotEl(playerIdx) {
  if (playerIdx === 0) return null;
  const slots = els.cpuArea.querySelectorAll(".cpu-slot");
  return slots[playerIdx - 1] || null;
}

function getCpuHandEl(playerIdx) {
  const slot = getCpuSlotEl(playerIdx);
  return slot ? slot.querySelector(".cpu-hand") : null;
}

function getSourceCardRect(playerIdx) {
  let el;
  if (playerIdx === 0) {
    el = els.playerHand.querySelector(".card");
  } else {
    const handEl = getCpuHandEl(playerIdx);
    el = handEl ? handEl.querySelector(".card") : null;
  }
  if (el) return el.getBoundingClientRect();
  // Fallback: container rect.
  const fallback = playerIdx === 0 ? els.playerHand : (getCpuHandEl(playerIdx) || els.playerHand);
  return fallback.getBoundingClientRect();
}

function animateGhost(ghostEl, fromRect, toRect, duration) {
  return new Promise(resolve => {
    ghostEl.classList.add("ghost");
    ghostEl.style.left = fromRect.left + "px";
    ghostEl.style.top = fromRect.top + "px";
    ghostEl.style.width = fromRect.width + "px";
    ghostEl.style.height = fromRect.height + "px";
    ghostEl.style.transitionDuration = duration + "ms";
    document.body.appendChild(ghostEl);
    // Force reflow before applying transform.
    ghostEl.getBoundingClientRect();
    const dx = toRect.left - fromRect.left;
    const dy = toRect.top - fromRect.top;
    const sx = toRect.width / fromRect.width;
    ghostEl.style.transform = `translate(${dx}px, ${dy}px) scale(${sx})`;
    setTimeout(() => { ghostEl.remove(); resolve(); }, duration + 30);
  });
}

function showColorBubble(playerIdx, color) {
  let anchor;
  if (playerIdx === 0) anchor = els.playerHand;
  else anchor = getCpuSlotEl(playerIdx);
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  const bubble = document.createElement("div");
  bubble.className = "color-bubble";
  bubble.dataset.color = color;
  bubble.textContent = COLOR_LABEL[color] + "!";
  bubble.style.left = (r.left + r.width / 2) + "px";
  if (playerIdx === 0) {
    bubble.classList.add("tail-bottom");
    bubble.style.top = (r.top - 56) + "px";
  } else {
    bubble.classList.add("tail-top");
    bubble.style.top = (r.bottom + 10) + "px";
  }
  document.body.appendChild(bubble);
  requestAnimationFrame(() => bubble.classList.add("show"));
  setTimeout(() => {
    bubble.classList.remove("show");
    setTimeout(() => bubble.remove(), 220);
  }, 1300);
}

function flashDiscard() {
  els.discard.classList.remove("pop");
  // Trigger reflow so the animation restarts on each play.
  void els.discard.offsetWidth;
  els.discard.classList.add("pop");
}

async function animatePlayFrom(playerIdx, card, duration) {
  const fromRect = getSourceCardRect(playerIdx);
  const toRect = els.discard.getBoundingClientRect();
  const ghost = cardEl(card);
  await animateGhost(ghost, fromRect, toRect, duration);
}

function drawCountFor(card) {
  if (card.kind === "action" && card.value === "draw2") return 2;
  if (card.kind === "wild" && card.value === "wild4") return 4;
  return 0;
}

async function animateDrawN(playerIdx, n, perCardMs = TIMING.penaltyEach, gap = TIMING.penaltyGap) {
  const flights = [];
  for (let i = 0; i < n; i++) {
    flights.push(animateDrawTo(playerIdx, perCardMs));
    if (i < n - 1) await sleep(gap);
  }
  await Promise.all(flights);
}

async function animateDrawTo(playerIdx, duration) {
  const fromRect = els.deckBtn.getBoundingClientRect();
  let toEl;
  if (playerIdx === 0) toEl = els.playerHand;
  else toEl = getCpuHandEl(playerIdx) || els.playerHand;
  const toRect = toEl.getBoundingClientRect();
  // Aim ghost at a "card-sized" target inside the destination so scale isn't huge.
  const targetW = playerIdx === 0 ? fromRect.width : Math.min(48, fromRect.width);
  const targetH = playerIdx === 0 ? fromRect.height : Math.min(70, fromRect.height);
  const center = {
    left: toRect.left + (toRect.width - targetW) / 2,
    top: toRect.top + (toRect.height - targetH) / 2,
    width: targetW,
    height: targetH,
  };
  const ghost = cardEl({}, { back: true });
  await animateGhost(ghost, fromRect, center, duration);
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

  // Direction indicator
  const reversed = state.direction === -1;
  els.dirArrow.classList.toggle("reverse", reversed);
  const nextIdx = UNO.peekNext(state);
  const nextName = state.players[nextIdx].name;
  els.dirLabel.textContent = `${reversed ? "ぎゃくまわり" : "じゅんまわり"} ・ つぎ: ${nextName}`;

  // Turn indicator
  const cur = state.players[state.turnIdx];
  els.turnIndicator.classList.toggle("your-turn", myTurn);
  els.turnIndicator.textContent = state.over
    ? "おわり"
    : myTurn ? "あなたのばん" : `${cur.name}のばん`;

  // status — show last log line
  els.status.textContent = state.log[state.log.length - 1] || "";

  // UNO button always visible during a game; pulse when at risk (1 or 2 cards).
  els.unoBtn.hidden = state.over;
  const atRisk = me.hand.length === 1 || me.hand.length === 2;
  els.unoBtn.classList.toggle("ready", atRisk && !me.unoCalled);
  els.unoBtn.classList.toggle("called", me.unoCalled);
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

async function doPlay(i, color) {
  const me = state.players[0];
  const card = me.hand[i];
  // Hide source card immediately so the ghost is the only visible copy.
  const sourceEl = els.playerHand.children[i];
  if (sourceEl) sourceEl.style.visibility = "hidden";
  await animatePlayFrom(0, card, TIMING.playerPlay);
  const drawN = drawCountFor(card);
  if (drawN > 0) {
    const targetIdx = UNO.peekNext(state, 0);
    await animateDrawN(targetIdx, drawN);
  }
  const result = UNO.playCard(state, 0, i, color);
  if (!result.ok) { toast(result.reason); render(); return; }
  log(`あなた: ${describeCard(card)}${color ? ` → ${COLOR_LABEL[color]}` : ""}`);
  flashDiscard();
  if (color) showColorBubble(0, color);
  render();
  if (state.over) { showResult(); return; }
  scheduleNextTurn();
}

function scheduleNextTurn() {
  if (!state || state.over) return;
  const cur = state.players[state.turnIdx];
  if (cur.isCpu) setTimeout(() => cpuTurn(state.turnIdx), TIMING.betweenTurns);
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

async function onDeckClick() {
  if (!isHumanTurn()) return;
  await animateDrawTo(0, TIMING.playerDraw);
  const r = UNO.drawForTurn(state, 0);
  if (!r.ok) { toast(r.reason); return; }
  log(`あなた: 1まいひいた`);
  state.turnIdx = UNO.peekNext(state);
  render();
  scheduleNextTurn();
}

async function cpuTurn(idx) {
  if (!state || state.over || state.turnIdx !== idx) return;
  const cpu = state.players[idx];

  // Thinking pause first — gives the human a chance to press UNO if they meant to.
  els.status.textContent = `${cpu.name}: かんがえちゅう…`;
  await sleep(TIMING.thinking);
  if (!state || state.over || state.turnIdx !== idx) return;

  // Penalty (checked after the grace window, not before).
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
    await animateDrawTo(idx, TIMING.cpuDraw);
    if (!state || state.over || state.turnIdx !== idx) return;
    const r = UNO.drawForTurn(state, idx);
    if (!r.ok) {
      log(`${cpu.name}: ひけない`);
      state.turnIdx = UNO.peekNext(state, idx);
      render();
      scheduleNextTurn();
      return;
    }
    log(`${cpu.name}: 1まいひいた`);
    render();

    const top = state.discard[state.discard.length - 1];
    const newCardIdx = cpu.hand.length - 1;
    const drawn = cpu.hand[newCardIdx];
    const canPlayDrawn = UNO.canPlay(drawn, top, state.currentColor) &&
        !(drawn.kind === "wild" && drawn.value === "wild4" && !UNO.canPlayWild4(cpu.hand, state.currentColor));
    if (canPlayDrawn) {
      await sleep(TIMING.cpuDrawThenPlay);
      if (!state || state.over || state.turnIdx !== idx) return;
      const chosen = drawn.kind === "wild" ? bestColorFor(idx) : null;
      const willHaveOne = cpu.hand.length === 2;
      await animatePlayFrom(idx, drawn, TIMING.cpuPlay);
      const drawN2 = drawCountFor(drawn);
      if (drawN2 > 0) {
        const targetIdx = UNO.peekNext(state, idx);
        await animateDrawN(targetIdx, drawN2);
      }
      UNO.playCard(state, idx, newCardIdx, chosen);
      if (willHaveOne) { UNO.callUno(state, idx); toast(`${cpu.name}: UNO!`); }
      log(`${cpu.name}: ${describeCard(drawn)}${chosen ? ` → ${COLOR_LABEL[chosen]}` : ""}`);
      flashDiscard();
      if (chosen) showColorBubble(idx, chosen);
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
  await animatePlayFrom(idx, card, TIMING.cpuPlay);
  if (!state || state.over || state.turnIdx !== idx) return;
  const drawN3 = drawCountFor(card);
  if (drawN3 > 0) {
    const targetIdx = UNO.peekNext(state, idx);
    await animateDrawN(targetIdx, drawN3);
  }
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
  flashDiscard();
  if (move.chosenColor) showColorBubble(idx, move.chosenColor);
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
  if (!state || state.over) return;
  const me = state.players[0];
  if (UNO.callUno(state, 0)) {
    toast("UNO!");
  } else {
    toast("まだUNOじゃないよ");
  }
  render();
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
