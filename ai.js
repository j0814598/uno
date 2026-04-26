// CPU AI — simple but reasonable strategy:
// 1. Prefer playing action/wild cards strategically.
// 2. Save Wild +4 unless it's the only legal play or opponent is close to winning.
// 3. Pick the color it has the most of when playing a wild.

function chooseCpuMove(state) {
  const hand = state.hands.cpu;
  const top = state.discard[state.discard.length - 1];
  const color = state.currentColor;

  const playable = [];
  hand.forEach((c, i) => {
    if (!UNO.canPlay(c, top, color)) return;
    if (c.kind === "wild" && c.value === "wild4" && !UNO.canPlayWild4(hand, color)) return;
    playable.push({ card: c, idx: i });
  });

  if (playable.length === 0) return { type: "draw" };

  const playerHandSize = state.hands.player.length;

  // Score each option (lower = play first / better).
  function score({ card }) {
    if (card.kind === "wild" && card.value === "wild4") {
      // Save unless player is close to winning or it's our only option.
      return playerHandSize <= 2 ? 1 : 100;
    }
    if (card.kind === "wild") return 90;
    if (card.kind === "action") {
      // Aggressive when player is low on cards.
      if (playerHandSize <= 3) return 10;
      return 30;
    }
    return 50; // numbers
  }

  playable.sort((a, b) => score(a) - score(b));
  const choice = playable[0];

  let chosenColor = null;
  if (choice.card.kind === "wild") {
    chosenColor = pickBestColor(hand);
  }
  return { type: "play", idx: choice.idx, chosenColor };
}

function pickBestColor(hand) {
  const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) {
    if (c.color in counts) counts[c.color]++;
  }
  let best = "red", bestN = -1;
  for (const c of UNO.COLORS) {
    if (counts[c] > bestN) { bestN = counts[c]; best = c; }
  }
  return best;
}

window.AI = { chooseCpuMove };
