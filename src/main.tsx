import React from "react";
import { createRoot } from "react-dom/client";
import { Coins, Hand, RotateCcw, Sparkles } from "lucide-react";
import "./styles.css";

type Suit = "spades" | "hearts" | "diamonds" | "clubs";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

type Card = {
  id: string;
  suit: Suit;
  rank: Rank;
  hidden?: boolean;
  dealtAt: number;
};

type Phase = "betting" | "playing" | "dealer" | "roundOver" | "broke";

const suits: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const chipOptions = [10, 25, 50, 100];

const suitGlyph: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

const suitName: Record<Suit, string> = {
  spades: "Spade",
  hearts: "Heart",
  diamonds: "Diamond",
  clubs: "Club",
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function buildDeck() {
  return suits.flatMap((suit) =>
    ranks.map((rank) => ({
      id: `${suit}-${rank}-${crypto.randomUUID()}`,
      suit,
      rank,
      dealtAt: Date.now(),
    })),
  );
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

function draw(deck: Card[]) {
  const nextDeck = [...deck];
  const card = nextDeck.pop();
  if (!card) throw new Error("Deck is empty");
  return [{ ...card, hidden: false, dealtAt: Date.now() }, nextDeck] as const;
}

function App() {
  const [deck, setDeck] = React.useState<Card[]>(() => shuffle(buildDeck()));
  const [playerHand, setPlayerHand] = React.useState<Card[]>([]);
  const [dealerHand, setDealerHand] = React.useState<Card[]>([]);
  const [phase, setPhase] = React.useState<Phase>("betting");
  const [bankroll, setBankroll] = React.useState(1000);
  const [bet, setBet] = React.useState(50);
  const [message, setMessage] = React.useState("칩을 고르고 딜을 시작하세요.");
  const [isBusy, setIsBusy] = React.useState(false);
  const [round, setRound] = React.useState(1);
  const [streak, setStreak] = React.useState(0);

  const playerScore = handValue(playerHand);
  const dealerScore = handValue(dealerHand);
  const canDeal = phase === "betting" && !isBusy && bankroll >= bet;
  const canAct = phase === "playing" && !isBusy;

  const ensureDeck = React.useCallback((currentDeck: Card[]) => {
    if (currentDeck.length > 14) return currentDeck;
    setMessage("새 슈를 섞는 중입니다...");
    return shuffle(buildDeck());
  }, []);

  const updateBet = (amount: number) => {
    if (phase !== "betting") return;
    setBet(Math.min(amount, bankroll || amount));
  };

  const settleRound = React.useCallback(
    async (result: "win" | "lose" | "push" | "blackjack", customMessage?: string) => {
      setIsBusy(true);
      await sleep(350);
      const isBrokeAfterLoss = result === "lose" && bankroll - bet <= 0;

      if (result === "win") {
        setBankroll((cash) => cash + bet);
        setStreak((count) => count + 1);
        setMessage(customMessage ?? "승리! 딜러보다 한 수 위였습니다.");
      } else if (result === "blackjack") {
        setBankroll((cash) => cash + Math.floor(bet * 1.5));
        setStreak((count) => count + 1);
        setMessage(customMessage ?? "블랙잭! 3:2 보너스를 받았습니다.");
      } else if (result === "lose") {
        setBankroll((cash) => Math.max(0, cash - bet));
        setStreak(0);
        setMessage(
          isBrokeAfterLoss ? "칩이 모두 떨어졌습니다. 새로 시작해볼까요?" : customMessage ?? "패배했습니다. 다음 판에서 흐름을 되찾아보세요.",
        );
      } else {
        setMessage(customMessage ?? "푸시. 베팅금은 그대로 유지됩니다.");
      }

      setPhase(isBrokeAfterLoss ? "broke" : "roundOver");
      setIsBusy(false);
    },
    [bankroll, bet],
  );

  const deal = async () => {
    if (!canDeal) return;
    setIsBusy(true);
    setMessage("카드를 나누는 중...");

    let nextDeck = ensureDeck(deck);
    let player: Card[] = [];
    let dealer: Card[] = [];
    setPlayerHand([]);
    setDealerHand([]);
    setPhase("playing");

    for (let i = 0; i < 4; i += 1) {
      const [card, remaining] = draw(nextDeck);
      nextDeck = remaining;
      await sleep(260);
      if (i % 2 === 0) {
        player = [...player, card];
        setPlayerHand(player);
      } else {
        const dealerCard = i === 3 ? { ...card, hidden: true } : card;
        dealer = [...dealer, dealerCard];
        setDealerHand(dealer);
      }
    }

    setDeck(nextDeck);
    setIsBusy(false);

    if (isBlackjack(player)) {
      const revealedDealer = dealer.map((card) => ({ ...card, hidden: false, dealtAt: Date.now() }));
      setDealerHand(revealedDealer);
      await settleRound(handValue(revealedDealer) === 21 ? "push" : "blackjack");
      return;
    }

    setMessage("히트하거나 스탠드하세요.");
  };

  const hit = async () => {
    if (!canAct) return;
    setIsBusy(true);
    const [card, remaining] = draw(ensureDeck(deck));
    const nextHand = [...playerHand, card];
    await sleep(180);
    setPlayerHand(nextHand);
    setDeck(remaining);
    setIsBusy(false);

    if (handValue(nextHand) > 21) {
      await settleRound("lose", "버스트! 21을 넘었습니다.");
    }
  };

  const stand = async () => {
    if (!canAct) return;
    setIsBusy(true);
    setPhase("dealer");
    setMessage("딜러가 숨긴 카드를 공개합니다.");
    await sleep(420);

    let nextDeck = ensureDeck(deck);
    let dealer = dealerHand.map((card) => ({ ...card, hidden: false, dealtAt: Date.now() }));
    setDealerHand(dealer);
    await sleep(520);

    while (handValue(dealer) < 17) {
      const [card, remaining] = draw(nextDeck);
      nextDeck = remaining;
      dealer = [...dealer, card];
      setDealerHand(dealer);
      setDeck(nextDeck);
      setMessage("딜러가 한 장 더 받습니다.");
      await sleep(620);
    }

    setDeck(nextDeck);
    const finalDealer = handValue(dealer);

    if (finalDealer > 21) {
      await settleRound("win", "딜러 버스트! 칩을 가져옵니다.");
    } else if (finalDealer > playerScore) {
      await settleRound("lose", "딜러가 더 높은 패를 만들었습니다.");
    } else if (finalDealer < playerScore) {
      await settleRound("win", "플레이어 승리! 테이블이 반짝입니다.");
    } else {
      await settleRound("push", "동점입니다. 베팅금은 그대로입니다.");
    }
  };

  const nextRound = () => {
    const nextBet = Math.min(bet, bankroll);
    setPlayerHand([]);
    setDealerHand([]);
    setBet(nextBet || 10);
    setPhase(bankroll > 0 ? "betting" : "broke");
    setMessage(bankroll > 0 ? "다음 라운드입니다. 베팅을 조정하세요." : "칩이 없습니다. 새 게임을 시작하세요.");
    setRound((value) => value + 1);
  };

  const resetGame = () => {
    setDeck(shuffle(buildDeck()));
    setPlayerHand([]);
    setDealerHand([]);
    setPhase("betting");
    setBankroll(1000);
    setBet(50);
    setMessage("새 테이블에 앉았습니다. 행운을 빕니다.");
    setRound(1);
    setStreak(0);
  };

  return (
    <main className="app-shell">
      <div className="felt-glow" />
      <section className="table">
        <header className="top-bar">
          <div>
            <p className="eyebrow">Vibe Casino</p>
            <h1>Blackjack Royale</h1>
          </div>
          <div className="stats">
            <Stat label="Bankroll" value={`$${bankroll}`} />
            <Stat label="Bet" value={`$${bet}`} />
            <Stat label="Round" value={String(round)} />
          </div>
        </header>

        <div className="dealer-light" />

        <HandArea title="Dealer" score={dealerScore || "?"} hand={dealerHand} side="dealer" />

        <section className="center-lane" aria-live="polite">
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
              <button
                className={`chip chip-${amount} ${bet === amount ? "active" : ""}`}
                key={amount}
                onClick={() => updateBet(amount)}
                disabled={phase !== "betting" || bankroll < amount}
              >
                ${amount}
              </button>
            ))}
          </div>
        </section>

        <HandArea title="Player" score={playerScore} hand={playerHand} side="player" />

        <footer className="control-panel">
          <button className="primary" onClick={deal} disabled={!canDeal}>
            <Coins size={18} />
            Deal
          </button>
          <button onClick={hit} disabled={!canAct}>
            <Hand size={18} />
            Hit
          </button>
          <button onClick={stand} disabled={!canAct}>
            Stand
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
            <span>Table limit</span>
            <strong>$10 - $100</strong>
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
}: {
  title: string;
  score: number | string;
  hand: Card[];
  side: "dealer" | "player";
}) {
  return (
    <section className={`hand-zone ${side}`}>
      <div className="hand-meta">
        <span>{title}</span>
        <strong>{score}</strong>
      </div>
      <div className="cards">
        {hand.length === 0 ? (
          <div className="empty-card-slot">Waiting</div>
        ) : (
          hand.map((card, index) => <PlayingCard card={card} key={card.id} index={index} />)
        )}
      </div>
    </section>
  );
}

function PlayingCard({ card, index }: { card: Card; index: number }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const style = {
    "--delay": `${index * 70}ms`,
    "--tilt": `${(index - 1) * 3}deg`,
  } as React.CSSProperties;

  return (
    <article className={`playing-card ${red ? "red" : "black"} ${card.hidden ? "hidden-card" : ""}`} style={style}>
      <div className="card-face">
        {card.hidden ? (
          <div className="card-back">
            <img src="/images/card-back.svg" alt="Hidden card" />
          </div>
        ) : (
          <>
            <div className="corner top">
              <b>{card.rank}</b>
              <span>{suitGlyph[card.suit]}</span>
            </div>
            <img className="suit-art" src={`/images/${card.suit}.svg`} alt={suitName[card.suit]} />
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
