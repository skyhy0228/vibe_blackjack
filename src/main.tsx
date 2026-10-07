import React from "react";
import { createRoot } from "react-dom/client";
import { Coins, Hand, RotateCcw, Scissors, Shield, Sparkles, StepBack, Trash2, TrendingUp } from "lucide-react";
import "./styles.css";

type Suit = "spades" | "hearts" | "diamonds" | "clubs";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
type Phase = "betting" | "insurance" | "playing" | "dealer" | "roundOver" | "broke";
type HandStatus = "active" | "stood" | "busted" | "doubled";
type RoundResult = "win" | "lose" | "push" | "blackjack";

type Card = { id: string; suit: Suit; rank: Rank; hidden?: boolean; dealtAt: number };
type PlayerHand = {
  id: string;
  cards: Card[];
  bet: number;
  status: HandStatus;
  result?: RoundResult;
  resultText?: string;
  splitFromPair?: boolean;
};

const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const chipOptions = [10, 25, 50, 100];
const startingBankrollOptions = [500, 1000, 2500, 5000];
const defaultStartingBankroll = 1000;
const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path}`;

const suitGlyph: Record<Suit, string> = { spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" };
const suitName: Record<Suit, string> = { spades: "Spade", hearts: "Heart", diamonds: "Diamond", clubs: "Club" };
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function buildDeck() {
  return suits.flatMap((suit) => ranks.map((rank) => ({ id: `${suit}-${rank}-${crypto.randomUUID()}`, suit, rank, dealtAt: Date.now() })));
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function cardValue(rank: Rank) {
  if (rank === "A") return 11;
  if (["K", "Q", "J"].includes(rank)) return 10;
  return Number(rank);
}

function handValue(hand: Card[]) {
  let total = 0;
  let aces = 0;
  hand.forEach((card) => {
    if (card.hidden) return;
    total += cardValue(card.rank);
    if (card.rank === "A") aces += 1;
  });
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function isBlackjack(hand: Card[]) {
  return hand.length === 2 && handValue(hand) === 21;
}

function canSplitPair(hand: PlayerHand) {
  return hand.cards.length === 2 && cardValue(hand.cards[0].rank) === cardValue(hand.cards[1].rank);
}

function draw(deck: Card[]) {
  const nextDeck = [...deck];
  const card = nextDeck.pop();
  if (!card) throw new Error("Deck is empty");
  return [{ ...card, hidden: false, dealtAt: Date.now() }, nextDeck] as const;
}

function resultDelta(result: RoundResult, bet: number) {
  if (result === "win") return bet;
  if (result === "blackjack") return Math.floor(bet * 1.5);
  if (result === "lose") return -bet;
  return 0;
}

function App() {
  const [deck, setDeck] = React.useState<Card[]>(() => shuffle(buildDeck()));
  const [playerHands, setPlayerHands] = React.useState<PlayerHand[]>([]);
  const [activeHandIndex, setActiveHandIndex] = React.useState(0);
  const [dealerHand, setDealerHand] = React.useState<Card[]>([]);
  const [phase, setPhase] = React.useState<Phase>("betting");
  const [startingBankroll, setStartingBankroll] = React.useState(defaultStartingBankroll);
  const [bankroll, setBankroll] = React.useState(defaultStartingBankroll);
  const [betStack, setBetStack] = React.useState<number[]>([]);
  const [insuranceBet, setInsuranceBet] = React.useState(0);
  const [message, setMessage] = React.useState("시작 금액을 정하고 칩을 올려 딜을 시작하세요.");
  const [isBusy, setIsBusy] = React.useState(false);
  const [round, setRound] = React.useState(1);
  const [streak, setStreak] = React.useState(0);

  const bet = betStack.reduce((total, amount) => total + amount, 0);
  const totalTableBet = playerHands.reduce((total, hand) => total + hand.bet, 0);
  const activeHand = playerHands[activeHandIndex];
  const dealerScore = handValue(dealerHand);
  const maxInsurance = Math.floor(totalTableBet / 2);
  const riskOnTable = phase === "betting" ? bet : totalTableBet + insuranceBet;
  const availableForNewRisk = Math.max(0, bankroll - riskOnTable);
  const chipCounts = chipOptions.reduce<Record<number, number>>((counts, amount) => {
    counts[amount] = betStack.filter((chip) => chip === amount).length;
    return counts;
  }, {});

  const canConfigureBankroll = phase === "betting" && round === 1 && playerHands.length === 0 && dealerHand.length === 0 && !isBusy;
  const canDeal = phase === "betting" && !isBusy && bet > 0 && bankroll >= bet;
  const canAct = phase === "playing" && !isBusy && Boolean(activeHand) && activeHand.status === "active";
  const canDouble = canAct && activeHand.cards.length === 2 && availableForNewRisk >= activeHand.bet;
  const canSplit = canAct && playerHands.length < 4 && canSplitPair(activeHand) && availableForNewRisk >= activeHand.bet;
  const canInsure = phase === "insurance" && insuranceBet === 0 && maxInsurance > 0 && availableForNewRisk >= maxInsurance && !isBusy;
  const appStyle = {
    "--table-image": `url("${assetPath("images/casino-table.svg")}")`,
    "--card-back-image": `url("${assetPath("images/card-back.svg")}")`,
  } as React.CSSProperties;

  const ensureDeck = React.useCallback((currentDeck: Card[]) => {
    if (currentDeck.length > 14) return currentDeck;
    setMessage("새 슈를 섞는 중입니다...");
    return shuffle(buildDeck());
  }, []);

  const updateStartingBankroll = (amount: number) => {
    if (!canConfigureBankroll) return;
    const cleanAmount = Math.max(100, Math.min(50000, Math.round(amount || defaultStartingBankroll)));
    setStartingBankroll(cleanAmount);
    setBankroll(cleanAmount);
    setBetStack([]);
    setMessage(`시작 금액을 $${cleanAmount}로 설정했습니다. 원하는 칩을 올려보세요.`);
  };

  const addChip = (amount: number) => {
    if (phase !== "betting") return;
    if (bet + amount > bankroll) {
      setMessage("보유 금액보다 많이 베팅할 수 없습니다.");
      return;
    }
    setBetStack((stack) => [...stack, amount]);
    setMessage(`$${amount} 칩을 올렸습니다.`);
  };

  const undoChip = () => {
    if (phase !== "betting") return;
    setBetStack((stack) => stack.slice(0, -1));
    setMessage("마지막 칩을 되돌렸습니다.");
  };

  const clearBet = () => {
    if (phase !== "betting") return;
    setBetStack([]);
    setMessage("베팅을 비웠습니다. 원하는 칩을 다시 올리세요.");
  };

  const finishRound = React.useCallback(
    async (settledHands: PlayerHand[], customMessage?: string, revealedDealer?: Card[], insuranceDelta = 0) => {
      setIsBusy(true);
      await sleep(260);
      const mainDelta = settledHands.reduce((total, hand) => total + resultDelta(hand.result ?? "push", hand.bet), 0);
      const nextBankroll = Math.max(0, bankroll + mainDelta + insuranceDelta);
      const winningHands = settledHands.filter((hand) => hand.result === "win" || hand.result === "blackjack").length;

      setPlayerHands(settledHands);
      if (revealedDealer) setDealerHand(revealedDealer);
      setBankroll(nextBankroll);
      setStreak((count) => (winningHands > 0 && mainDelta + insuranceDelta > 0 ? count + 1 : 0));
      setMessage(customMessage ?? settledHands.map((hand, index) => `Hand ${index + 1}: ${hand.resultText}`).join(" / "));
      setPhase(nextBankroll <= 0 ? "broke" : "roundOver");
      setIsBusy(false);
    },
    [bankroll],
  );

  const settleAgainstDealer = React.useCallback(
    async (hands: PlayerHand[], dealerCards: Card[], insuranceDelta = insuranceBet ? -insuranceBet : 0) => {
      const dealerTotal = handValue(dealerCards);
      const settled = hands.map((hand) => {
        const score = handValue(hand.cards);
        if (score > 21) return { ...hand, status: "busted" as const, result: "lose" as const, resultText: "Bust" };
        if (dealerTotal > 21) return { ...hand, result: "win" as const, resultText: "Dealer bust" };
        if (score > dealerTotal) return { ...hand, result: "win" as const, resultText: "Win" };
        if (score < dealerTotal) return { ...hand, result: "lose" as const, resultText: "Lose" };
        return { ...hand, result: "push" as const, resultText: "Push" };
      });
      const summary = insuranceDelta < 0 ? `보험 베팅 $${insuranceBet}은 잃었습니다. ` : "";
      await finishRound(settled, `${summary}${settled.map((hand, index) => `Hand ${index + 1}: ${hand.resultText}`).join(" / ")}`, dealerCards, insuranceDelta);
      setInsuranceBet(0);
    },
    [finishRound, insuranceBet],
  );

  const playDealerAndSettle = async (hands: PlayerHand[]) => {
    setIsBusy(true);
    setPhase("dealer");
    setMessage("딜러가 숨긴 카드를 공개합니다.");
    await sleep(420);

    let nextDeck = ensureDeck(deck);
    let dealer = dealerHand.map((card) => ({ ...card, hidden: false, dealtAt: Date.now() }));
    setDealerHand(dealer);
    await sleep(520);

    if (hands.some((hand) => handValue(hand.cards) <= 21)) {
      while (handValue(dealer) < 17) {
        const [card, remaining] = draw(nextDeck);
        nextDeck = remaining;
        dealer = [...dealer, card];
        setDealerHand(dealer);
        setDeck(nextDeck);
        setMessage("딜러가 한 장 더 받습니다.");
        await sleep(620);
      }
    }

    setDeck(nextDeck);
    setIsBusy(false);
    await settleAgainstDealer(hands, dealer);
  };

  const advanceOrSettle = async (hands: PlayerHand[], fromIndex: number) => {
    const nextIndex = hands.findIndex((hand, index) => index > fromIndex && hand.status === "active");
    setPlayerHands(hands);

    if (nextIndex >= 0) {
      setActiveHandIndex(nextIndex);
      setMessage(`Hand ${nextIndex + 1} 차례입니다.`);
      return;
    }

    if (hands.every((hand) => handValue(hand.cards) > 21)) {
      await finishRound(
        hands.map((hand) => ({ ...hand, result: "lose" as const, resultText: "Bust" })),
        "모든 핸드가 버스트되었습니다.",
        dealerHand.map((card) => ({ ...card, hidden: false })),
        insuranceBet ? -insuranceBet : 0,
      );
      setInsuranceBet(0);
      return;
    }

    await playDealerAndSettle(hands);
  };

  const checkDealerBlackjack = async (insuranceDelta = 0) => {
    const revealedDealer = dealerHand.map((card) => ({ ...card, hidden: false, dealtAt: Date.now() }));
    const dealerHasBlackjack = handValue(revealedDealer) === 21 && revealedDealer.length === 2;

    if (dealerHasBlackjack) {
      const settled = playerHands.map((hand) => {
        const result: RoundResult = isBlackjack(hand.cards) && !hand.splitFromPair ? "push" : "lose";
        return { ...hand, result, resultText: result === "push" ? "Push" : "Dealer blackjack" };
      });
      const insuranceSummary = insuranceDelta > 0 ? `보험 적중 +$${insuranceDelta}. ` : "";
      await finishRound(settled, `${insuranceSummary}딜러 블랙잭입니다.`, revealedDealer, insuranceDelta);
      setInsuranceBet(0);
      return;
    }

    setDealerHand(revealedDealer.map((card, index) => (index === 1 ? { ...card, hidden: true } : card)));
    setPhase("playing");
    setMessage(insuranceDelta < 0 ? `딜러 블랙잭이 아닙니다. 보험 베팅 $${insuranceBet}은 잃고 진행합니다.` : "히트, 스탠드, 더블다운 또는 스플릿을 선택하세요.");
  };

  const takeInsurance = async () => {
    if (!canInsure) return;
    setInsuranceBet(maxInsurance);
    setMessage(`보험 $${maxInsurance}을 걸었습니다. 딜러 패를 확인합니다.`);
    await sleep(250);
    await checkDealerBlackjack(maxInsurance * 2);
  };

  const declineInsurance = async () => {
    if (phase !== "insurance" || isBusy) return;
    setMessage("보험 없이 딜러 패를 확인합니다.");
    await sleep(250);
    await checkDealerBlackjack(0);
  };

  const deal = async () => {
    if (!canDeal) return;
    setIsBusy(true);
    setMessage("카드를 나누는 중...");

    let nextDeck = ensureDeck(deck);
    let player: Card[] = [];
    let dealer: Card[] = [];
    setPlayerHands([]);
    setDealerHand([]);
    setInsuranceBet(0);
    setPhase("playing");

    for (let i = 0; i < 4; i += 1) {
      const [card, remaining] = draw(nextDeck);
      nextDeck = remaining;
      await sleep(260);
      if (i % 2 === 0) {
        player = [...player, card];
        setPlayerHands([{ id: "preview", cards: player, bet, status: "active" }]);
      } else {
        const dealerCard = i === 3 ? { ...card, hidden: true } : card;
        dealer = [...dealer, dealerCard];
        setDealerHand(dealer);
      }
    }

    const firstHand = { id: crypto.randomUUID(), cards: player, bet, status: "active" as const };
    setDeck(nextDeck);
    setPlayerHands([firstHand]);
    setActiveHandIndex(0);
    setIsBusy(false);

    if (dealer[0]?.rank === "A") {
      setPhase("insurance");
      setMessage(`딜러 오픈 카드가 A입니다. 보험은 최대 $${Math.floor(bet / 2)}입니다.`);
      return;
    }

    const revealedDealer = dealer.map((card) => ({ ...card, hidden: false, dealtAt: Date.now() }));
    const dealerBlackjack = handValue(revealedDealer) === 21 && revealedDealer.length === 2;
    if (isBlackjack(firstHand.cards) || dealerBlackjack) {
      const result = isBlackjack(firstHand.cards) && dealerBlackjack ? "push" : isBlackjack(firstHand.cards) ? "blackjack" : "lose";
      await finishRound([{ ...firstHand, result, resultText: result === "blackjack" ? "Blackjack" : result === "push" ? "Push" : "Dealer blackjack" }], undefined, revealedDealer);
      return;
    }

    setDealerHand(dealer);
    setMessage("히트, 스탠드, 더블다운 또는 스플릿을 선택하세요.");
  };

  const hit = async () => {
    if (!canAct) return;
    setIsBusy(true);
    const [card, remaining] = draw(ensureDeck(deck));
    const nextHands = playerHands.map((hand, index) => (index === activeHandIndex ? { ...hand, cards: [...hand.cards, card] } : hand));
    await sleep(180);
    setPlayerHands(nextHands);
    setDeck(remaining);
    setIsBusy(false);
    if (handValue(nextHands[activeHandIndex].cards) > 21) {
      await advanceOrSettle(nextHands.map((hand, index) => (index === activeHandIndex ? { ...hand, status: "busted" as const } : hand)), activeHandIndex);
    }
  };

  const stand = async () => {
    if (!canAct) return;
    await advanceOrSettle(playerHands.map((hand, index) => (index === activeHandIndex ? { ...hand, status: "stood" as const } : hand)), activeHandIndex);
  };

  const doubleDown = async () => {
    if (!canDouble) return;
    setIsBusy(true);
    const [card, remaining] = draw(ensureDeck(deck));
    const nextHands = playerHands.map((hand, index) => {
      if (index !== activeHandIndex) return hand;
      const cards = [...hand.cards, card];
      return { ...hand, cards, bet: hand.bet * 2, status: handValue(cards) > 21 ? ("busted" as const) : ("doubled" as const) };
    });
    await sleep(240);
    setPlayerHands(nextHands);
    setDeck(remaining);
    setIsBusy(false);
    await advanceOrSettle(nextHands, activeHandIndex);
  };

  const split = async () => {
    if (!canSplit) return;
    setIsBusy(true);
    let nextDeck = ensureDeck(deck);
    const [firstDraw, deckAfterFirst] = draw(nextDeck);
    const [secondDraw, deckAfterSecond] = draw(deckAfterFirst);
    nextDeck = deckAfterSecond;
    const splitHands: PlayerHand[] = [
      { id: crypto.randomUUID(), cards: [activeHand.cards[0], firstDraw], bet: activeHand.bet, status: "active", splitFromPair: true },
      { id: crypto.randomUUID(), cards: [activeHand.cards[1], secondDraw], bet: activeHand.bet, status: "active", splitFromPair: true },
    ];
    const nextHands = [...playerHands.slice(0, activeHandIndex), ...splitHands, ...playerHands.slice(activeHandIndex + 1)];
    await sleep(300);
    setPlayerHands(nextHands);
    setDeck(nextDeck);
    setMessage("스플릿 완료. 첫 번째 핸드부터 진행하세요.");
    setIsBusy(false);
  };

  const nextRound = () => {
    setPlayerHands([]);
    setDealerHand([]);
    setBetStack([]);
    setInsuranceBet(0);
    setActiveHandIndex(0);
    setPhase(bankroll > 0 ? "betting" : "broke");
    setMessage(bankroll > 0 ? "다음 라운드입니다. 원하는 칩을 올려 베팅하세요." : "칩이 없습니다. 새 게임을 시작하세요.");
    setRound((value) => value + 1);
  };

  const resetGame = () => {
    setDeck(shuffle(buildDeck()));
    setPlayerHands([]);
    setDealerHand([]);
    setPhase("betting");
    setBankroll(startingBankroll);
    setBetStack([]);
    setInsuranceBet(0);
    setActiveHandIndex(0);
    setMessage("새 테이블에 앉았습니다. 원하는 칩을 올려보세요.");
    setRound(1);
    setStreak(0);
  };

  return (
    <main className="app-shell" style={appStyle}>
      <div className="felt-glow" />
      <section className="table">
        <header className="top-bar">
          <div>
            <p className="eyebrow">Vibe Casino</p>
            <h1>Blackjack Royale</h1>
          </div>
          <div className="stats">
            <Stat label="Bankroll" value={`$${bankroll}`} />
            <Stat label="Bet" value={`$${phase === "betting" ? bet : totalTableBet}`} />
            <Stat label="Round" value={String(round)} />
          </div>
        </header>

        <div className="dealer-light" />
        <HandArea title="Dealer" score={dealerScore || "?"} hand={dealerHand} side="dealer" />

        <section className="center-lane" aria-live="polite">
          <div className="bankroll-panel">
            <label htmlFor="starting-bankroll">Starting cash</label>
            <div className="bankroll-input-row">
              <span>$</span>
              <input id="starting-bankroll" type="number" min="100" max="50000" step="100" value={startingBankroll} disabled={!canConfigureBankroll} onChange={(event) => updateStartingBankroll(Number(event.target.value))} />
            </div>
            <div className="quick-bankrolls">
              {startingBankrollOptions.map((amount) => (
                <button key={amount} onClick={() => updateStartingBankroll(amount)} disabled={!canConfigureBankroll}>
                  ${amount}
                </button>
              ))}
            </div>
          </div>
          <div className="shoe">
            <div className="deck-stack" />
            <span>{deck.length} cards</span>
          </div>
          <div className={`status-plaque ${phase === "roundOver" ? "settled" : ""}`}>
            <Sparkles size={18} />
            <p>{message}</p>
          </div>
          <div className="chip-tray" aria-label="Bet controls">
            {chipOptions.map((amount) => (
              <button className={`chip chip-${amount} ${chipCounts[amount] ? "active" : ""}`} key={amount} onClick={() => addChip(amount)} disabled={phase !== "betting" || bet + amount > bankroll}>
                ${amount}
                {chipCounts[amount] > 0 ? <span className="chip-count">x{chipCounts[amount]}</span> : null}
              </button>
            ))}
          </div>
          <div className="bet-stack" aria-label="Current bet">
            <span>{insuranceBet ? "Bet + insurance" : "Current bet"}</span>
            <strong>${phase === "betting" ? bet : totalTableBet + insuranceBet}</strong>
            <div className="bet-stack-actions">
              <button onClick={undoChip} disabled={phase !== "betting" || betStack.length === 0} title="Undo last chip">
                <StepBack size={16} />
              </button>
              <button onClick={clearBet} disabled={phase !== "betting" || betStack.length === 0} title="Clear bet">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </section>

        <section className="player-hands">
          {playerHands.length === 0 ? (
            <HandArea title="Player" score={0} hand={[]} side="player" />
          ) : (
            playerHands.map((hand, index) => <HandArea key={hand.id} title={`Hand ${index + 1}`} score={handValue(hand.cards)} hand={hand.cards} side="player" bet={hand.bet} active={index === activeHandIndex && phase === "playing"} result={hand.resultText} />)
          )}
        </section>

        <footer className="control-panel">
          <button className="primary" onClick={deal} disabled={!canDeal}>
            <Coins size={18} />
            Deal
          </button>
          <button onClick={takeInsurance} disabled={!canInsure}>
            <Shield size={18} />
            Insurance
          </button>
          <button onClick={declineInsurance} disabled={phase !== "insurance" || isBusy}>
            No Insurance
          </button>
          <button onClick={hit} disabled={!canAct}>
            <Hand size={18} />
            Hit
          </button>
          <button onClick={stand} disabled={!canAct}>
            Stand
          </button>
          <button onClick={doubleDown} disabled={!canDouble}>
            <TrendingUp size={18} />
            Double
          </button>
          <button onClick={split} disabled={!canSplit}>
            <Scissors size={18} />
            Split
          </button>
          <button onClick={nextRound} disabled={phase !== "roundOver"}>
            Next Round
          </button>
          <button className="ghost" onClick={resetGame}>
            <RotateCcw size={18} />
            Reset
          </button>
        </footer>

        <aside className="side-panel">
          <div>
            <span>Win streak</span>
            <strong>{streak}</strong>
          </div>
          <div>
            <span>Options</span>
            <strong>Insurance / Double / Split</strong>
          </div>
          <div>
            <span>Dealer rule</span>
            <strong>Stand on 17</strong>
          </div>
        </aside>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function HandArea({
  title,
  score,
  hand,
  side,
  bet,
  active,
  result,
}: {
  title: string;
  score: number | string;
  hand: Card[];
  side: "dealer" | "player";
  bet?: number;
  active?: boolean;
  result?: string;
}) {
  return (
    <section className={`hand-zone ${side} ${active ? "active-hand" : ""}`}>
      <div className="hand-meta">
        <span>{title}</span>
        <strong>{score}</strong>
        {bet ? <em>${bet}</em> : null}
        {result ? <small>{result}</small> : null}
      </div>
      <div className="cards">
        {hand.length === 0 ? <div className="empty-card-slot">Waiting</div> : hand.map((card, index) => <PlayingCard card={card} key={card.id} index={index} />)}
      </div>
    </section>
  );
}

function PlayingCard({ card, index }: { card: Card; index: number }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const style = { "--delay": `${index * 70}ms`, "--tilt": `${(index - 1) * 3}deg` } as React.CSSProperties;

  return (
    <article className={`playing-card ${red ? "red" : "black"} ${card.hidden ? "hidden-card" : ""}`} style={style}>
      <div className="card-face">
        {card.hidden ? (
          <div className="card-back">
            <img src={assetPath("images/card-back.svg")} alt="Hidden card" />
          </div>
        ) : (
          <>
            <div className="corner top">
              <b>{card.rank}</b>
              <span>{suitGlyph[card.suit]}</span>
            </div>
            <img className="suit-art" src={assetPath(`images/${card.suit}.svg`)} alt={suitName[card.suit]} />
            <div className="corner bottom">
              <b>{card.rank}</b>
              <span>{suitGlyph[card.suit]}</span>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
