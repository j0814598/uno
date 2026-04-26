// UNO game engine — official rules (108-card deck, 2 players: you vs CPU).

const COLORS = ["red", "yellow", "green", "blue"];
const ACTIONS = ["skip", "reverse", "draw2"];

function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ color, kind: "number", value: 0 });
    for (let n = 1; n <= 9; n++) {
      deck.push({ color, kind: "number", value: n });
      deck.push({ color, kind: "number", value: n });
    }
    for (const a of ACTIONS) {
      deck.push({ color, kind: "action", value: a });
      deck.push({ color, kind: "action", value: a });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color: "wild", kind: "wild", value: "wild" });
    deck.push({ color: "wild", kind: "wild", value: "wild4" });
  }
  return deck;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardId(c) {
  return `${c.color}-${c.kind}-${c.value}`;
}

function canPlay(card, top, currentColor) {
  if (card.kind === "wild") return true;
  if (card.color === currentColor) return true;
  if (top.kind === card.kind && top.value === card.value) return true;
  return false;
}

// Wild +4 is officially only legal if the player has no card matching the current color.
// (Number/action of other colors are fine; only color-matching cards forbid +4.)
function canPlayWild4(hand, currentColor) {
  return !hand.some(c => c.color === currentColor && c.kind !== "wild");
}

function newGame() {
  const deck = shuffle(buildDeck());
  const player = [];
  const cpu = [];
  for (let i = 0; i < 7; i++) {
    player.push(deck.pop());
    cpu.push(deck.pop());
  }
  // Flip first non-wild card as the starting discard (per official rules,
  // wild start is fine but Wild +4 must be returned to deck and reshuffled).
  let first;
  while (true) {
    first = deck.pop();
    if (first.kind === "wild" && first.value === "wild4") {
      deck.unshift(first);
      shuffle(deck);
      continue;
    }
    break;
  }

  const state = {
    deck,
    discard: [first],
    hands: { player, cpu },
    turn: "player",
    direction: 1,
    currentColor: first.color === "wild" ? null : first.color,
    pendingDraw: 0,    // accumulated draws (we don't stack by default; here used only for first-card effect resolution)
    skipNext: false,
    awaitingColor: false,
    awaitingUnoCall: false, // player just played down to 1, hasn't pressed UNO
    unoCalled: { player: false, cpu: false },
    over: false,
    winner: null,
    log: [],
  };

  // First-card effects (official rules) — applied to the player who would otherwise start (the player).
  applyFirstCardEffect(state, first);
  return state;
}

function applyFirstCardEffect(state, c) {
  if (c.kind === "action") {
    if (c.value === "skip") {
      // First player is skipped.
      state.turn = "cpu";
      log(state, "さいしょのカードはスキップ！ CPUのばん");
    } else if (c.value === "reverse") {
      // With 2 players reverse acts like skip.
      state.direction = -1;
      state.turn = "cpu";
      log(state, "さいしょのカードはリバース！ CPUのばん");
    } else if (c.value === "draw2") {
      // First player draws 2 and is skipped.
      drawN(state, "player", 2);
      state.turn = "cpu";
      log(state, "さいしょのカードはドロー2！ あなたが2まいひいてスキップ");
    }
  } else if (c.kind === "wild" && c.value === "wild") {
    // First player chooses color. We'll mark it for UI to prompt.
    state.awaitingColor = true;
    state.firstWildChooser = "player";
  }
  // Wild+4 was avoided by the deal loop.
}

function drawN(state, who, n) {
  for (let i = 0; i < n; i++) {
    if (!state.deck.length) reshuffle(state);
    if (!state.deck.length) return;
    state.hands[who].push(state.deck.pop());
  }
  // Drawing more than 1 (penalty) clears the UNO-pending state for that player.
  if (n > 1) state.unoCalled[who] = false;
}

function reshuffle(state) {
  if (state.discard.length <= 1) return;
  const top = state.discard.pop();
  const rest = state.discard.splice(0);
  state.discard.push(top);
  // Recolor wilds back to wild before reshuffling — but we keep them as wild objects already,
  // they only carry chosenColor in state.currentColor, not on the card itself.
  state.deck = shuffle(rest);
}

function nextTurn(state, skip = false) {
  // 2-player game: reverse = skip; we already handle skip explicitly.
  if (skip) {
    // stays on same player (next-next is current).
  } else {
    state.turn = state.turn === "player" ? "cpu" : "player";
  }
}

function playCard(state, who, idx, chosenColor) {
  const hand = state.hands[who];
  const card = hand[idx];
  const top = state.discard[state.discard.length - 1];
  if (!canPlay(card, top, state.currentColor)) return { ok: false, reason: "だせないカードだよ" };
  if (card.kind === "wild" && card.value === "wild4" && !canPlayWild4(hand, state.currentColor)) {
    return { ok: false, reason: "+4は おなじいろがないときだけ" };
  }

  hand.splice(idx, 1);
  state.discard.push(card);

  if (card.kind === "wild") {
    state.currentColor = chosenColor || null;
    if (!chosenColor) state.awaitingColor = true;
  } else {
    state.currentColor = card.color;
  }

  // UNO pending check (just played down to 1)
  if (hand.length === 1) {
    state.unoCalled[who] = false; // requires explicit call; CPU calls automatically in CPU logic
    state.awaitingUnoCall = (who === "player");
  }

  // Win check
  if (hand.length === 0) {
    state.over = true;
    state.winner = who;
    return { ok: true, win: true };
  }

  // Effects
  let skipNext = false;
  if (card.kind === "action") {
    const target = who === "player" ? "cpu" : "player";
    if (card.value === "skip") skipNext = true;
    if (card.value === "reverse") { state.direction *= -1; skipNext = true; } // 2 players → skip
    if (card.value === "draw2") { drawN(state, target, 2); skipNext = true; }
  } else if (card.kind === "wild" && card.value === "wild4") {
    const target = who === "player" ? "cpu" : "player";
    drawN(state, target, 4);
    skipNext = true;
  }

  nextTurn(state, skipNext);
  return { ok: true, skipNext };
}

function drawForTurn(state, who) {
  if (!state.deck.length) reshuffle(state);
  if (!state.deck.length) return { ok: false, reason: "やまふだがないよ" };
  const card = state.deck.pop();
  state.hands[who].push(card);
  // Player may immediately play it if legal — handled in UI.
  return { ok: true, card };
}

function callUno(state, who) {
  if (state.hands[who].length === 1) {
    state.unoCalled[who] = true;
    state.awaitingUnoCall = false;
    return true;
  }
  return false;
}

// If a player has 1 card but didn't call UNO before opponent acts, penalty: draw 2.
function checkUnoPenalty(state, who) {
  if (state.hands[who].length === 1 && !state.unoCalled[who]) {
    drawN(state, who, 2);
    state.awaitingUnoCall = false;
    return true;
  }
  return false;
}

function log(state, msg) {
  state.log.push(msg);
  if (state.log.length > 50) state.log.shift();
}

window.UNO = {
  COLORS, newGame, playCard, drawForTurn, canPlay, canPlayWild4,
  callUno, checkUnoPenalty, cardId,
};
