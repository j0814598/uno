// UNO game engine — official rules (108-card deck, 2-4 players: you vs CPU(s)).

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
function canPlayWild4(hand, currentColor) {
  return !hand.some(c => c.color === currentColor && c.kind !== "wild");
}

function newGame(numPlayers = 2) {
  numPlayers = Math.max(2, Math.min(4, numPlayers | 0));
  const deck = shuffle(buildDeck());
  const players = [];
  players.push({ id: "p0", name: "あなた", isCpu: false, hand: [], unoCalled: false });
  for (let i = 1; i < numPlayers; i++) {
    const name = numPlayers === 2 ? "CPU" : `CPU${i}`;
    players.push({ id: `p${i}`, name, isCpu: true, hand: [], unoCalled: false });
  }
  for (let r = 0; r < 7; r++) {
    for (const p of players) p.hand.push(deck.pop());
  }
  // Flip first non-Wild+4 card as starting discard.
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
    players,
    turnIdx: 0,
    direction: 1,
    currentColor: first.color === "wild" ? null : first.color,
    awaitingColor: false,
    firstWildChooser: null,
    awaitingUnoCall: false,
    over: false,
    winner: null,
    log: [],
  };

  applyFirstCardEffect(state, first);
  return state;
}

function peekNext(state, from = state.turnIdx, steps = 1) {
  const n = state.players.length;
  return ((from + state.direction * steps) % n + n) % n;
}

function advanceTurn(state, skip = false) {
  state.turnIdx = peekNext(state, state.turnIdx, skip ? 2 : 1);
}

function applyFirstCardEffect(state, c) {
  if (c.kind === "action") {
    const cur = state.players[state.turnIdx];
    if (c.value === "skip") {
      log(state, `さいしょのカードはスキップ！ ${cur.name}はおやすみ`);
      advanceTurn(state);
    } else if (c.value === "reverse") {
      state.direction = -1;
      if (state.players.length === 2) {
        log(state, `さいしょのカードはリバース！ ${cur.name}はおやすみ`);
        advanceTurn(state);
      } else {
        // 3+ players: reverse means start from the last-dealt player going backwards.
        state.turnIdx = state.players.length - 1;
        log(state, `さいしょのカードはリバース！ ぎゃくまわりにスタート`);
      }
    } else if (c.value === "draw2") {
      drawN(state, state.turnIdx, 2);
      log(state, `さいしょのカードはドロー2！ ${cur.name}が2まいひいてスキップ`);
      advanceTurn(state);
    }
  } else if (c.kind === "wild" && c.value === "wild") {
    state.awaitingColor = true;
    state.firstWildChooser = state.turnIdx;
  }
}

function drawN(state, idx, n) {
  for (let i = 0; i < n; i++) {
    if (!state.deck.length) reshuffle(state);
    if (!state.deck.length) return;
    state.players[idx].hand.push(state.deck.pop());
  }
  if (n > 1) state.players[idx].unoCalled = false;
}

function reshuffle(state) {
  if (state.discard.length <= 1) return;
  const top = state.discard.pop();
  const rest = state.discard.splice(0);
  state.discard.push(top);
  state.deck = shuffle(rest);
}

function playCard(state, idx, cardIdx, chosenColor) {
  const player = state.players[idx];
  const hand = player.hand;
  const card = hand[cardIdx];
  const top = state.discard[state.discard.length - 1];
  if (!canPlay(card, top, state.currentColor)) return { ok: false, reason: "だせないカードだよ" };
  if (card.kind === "wild" && card.value === "wild4" && !canPlayWild4(hand, state.currentColor)) {
    return { ok: false, reason: "+4は おなじいろがないときだけ" };
  }

  hand.splice(cardIdx, 1);
  state.discard.push(card);

  if (card.kind === "wild") {
    state.currentColor = chosenColor || null;
    if (!chosenColor) state.awaitingColor = true;
  } else {
    state.currentColor = card.color;
  }

  if (hand.length === 1) {
    // Preserve a pre-call made while the player still had 2 cards.
    if (!player.unoCalled) {
      state.awaitingUnoCall = !player.isCpu;
    }
  }

  if (hand.length === 0) {
    state.over = true;
    state.winner = idx;
    return { ok: true, win: true };
  }

  let skipNext = false;
  if (card.kind === "action") {
    if (card.value === "skip") skipNext = true;
    if (card.value === "reverse") {
      state.direction *= -1;
      if (state.players.length === 2) skipNext = true;
    }
    if (card.value === "draw2") {
      const targetIdx = peekNext(state);
      drawN(state, targetIdx, 2);
      skipNext = true;
    }
  } else if (card.kind === "wild" && card.value === "wild4") {
    const targetIdx = peekNext(state);
    drawN(state, targetIdx, 4);
    skipNext = true;
  }

  advanceTurn(state, skipNext);
  return { ok: true, skipNext };
}

function drawForTurn(state, idx) {
  if (!state.deck.length) reshuffle(state);
  if (!state.deck.length) return { ok: false, reason: "やまふだがないよ" };
  const card = state.deck.pop();
  state.players[idx].hand.push(card);
  return { ok: true, card };
}

function callUno(state, idx) {
  const p = state.players[idx];
  // Allow pre-calling at 2 cards (about to play down to 1) to avoid the
  // race where the next player acts before you can press the button.
  if (p.hand.length === 1 || p.hand.length === 2) {
    p.unoCalled = true;
    if (!p.isCpu) state.awaitingUnoCall = false;
    return true;
  }
  return false;
}

function checkUnoPenalty(state, idx) {
  const p = state.players[idx];
  if (p.hand.length === 1 && !p.unoCalled) {
    drawN(state, idx, 2);
    if (!p.isCpu) state.awaitingUnoCall = false;
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
  callUno, checkUnoPenalty, cardId, peekNext,
};
