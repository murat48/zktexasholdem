/**
 * AI Opponents — Real API calls to OpenAI, Claude and Gemini
 *
 * Each AI opponent uses a different provider and personality:
 *  🔥 Blaze   → OpenAI GPT-4o Mini        (risk-taker, aggressive)
 *  🦈 Steel   → Claude 3.5 Haiku           (tight, solid)
 *  🎓 Sage    → Gemini 2.5 Flash Lite      (balanced, GTO)
 *  🐟 Lucky   → random provider             (beginner, unpredictable)
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type AIProvider = 'openai' | 'claude' | 'gemini' | 'random';

export interface AIOpponent {
  id: string;
  name: string;
  title: string;
  description: string;
  provider: AIProvider;
  providerLabel: string;
  providerIcon: string;
  avatar: string;
  avatarBg: string;
  avatarBorder: string;
  difficulty: number;
  tagline: string;
  systemPrompt: string;
}

export type BotAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'bet'; amount: number }
  | { type: 'raise'; amount: number };

export interface GameContext {
  myCards: [number, number];
  communityCards: number[];
  myChips: number;
  opponentChips: number;
  pot: number;
  callAmount: number;
  round: 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'handover';
}

// ── System Prompts ─────────────────────────────────────────────────────────

const RISK_TAKER_PROMPT = `You are an aggressive, risk-loving Texas Hold'em poker player.
Your playstyle:
- You enter with a very wide range (raise at every opportunity, even preflop)
- You bluff frequently, especially on the river
- You rarely fold under pressure
- You prefer raising over calling
- You make large bets — 60-80% of the pot
Mindset: "Fold? I don't know that word!"`;

const GUARANTEE_PROMPT = `You are a solid, tight Texas Hold'em poker player.
Your playstyle:
- You only play strong hands; you don't hesitate to fold weak ones
- You rarely bluff; mostly value bet
- Your bet sizes are measured and controlled
- You make safe, methodical decisions
Mindset: "Play less, win more."`;

const BALANCED_PROMPT = `You are a balanced, GTO (Game Theory Optimal) Texas Hold'em poker expert.
Your playstyle:
- You adjust hand ranges based on position
- Mixed strategy: sometimes bluff, sometimes value
- You calculate pot odds and equity
- You optimize bet sizing for each situation
- You focus on long-term EV
Mindset: "Every move is mathematically calculated."`;

const FISH_PROMPT = `You are a beginner and quite inconsistent Texas Hold'em poker player.
Your playstyle:
- You play almost every hand
- Sometimes you make irrational folds
- You can't bluff when you should, and bluff when you shouldn't
- Your bet sizes are inconsistent
Mindset: "Feeling lucky! (Maybe...)"`;

// ── AI Opponent Registry ───────────────────────────────────────────────────

export const AI_OPPONENTS: AIOpponent[] = [
  {
    id: 'maniac',
    name: 'Blaze',
    title: 'Risk Taker',
    description: 'Plays every hand, raises non-stop. Never afraid to bluff. The most aggressive opponent.',
    provider: 'openai',
    providerLabel: 'GPT-4o Mini',
    providerIcon: '🤖',
    avatar: '🔥',
    avatarBg: 'bg-red-900',
    avatarBorder: 'border-red-500',
    difficulty: 7,
    tagline: 'Fold? I don\'t know that word!',
    systemPrompt: RISK_TAKER_PROMPT,
  },
  {
    id: 'solid',
    name: 'Steel',
    title: 'The Rock',
    description: 'Only plays strong hands. Solid, methodical, and patient.',
    provider: 'claude',
    providerLabel: 'Claude Haiku 4.5',
    providerIcon: '🧠',
    avatar: '🦈',
    avatarBg: 'bg-blue-900',
    avatarBorder: 'border-blue-400',
    difficulty: 8,
    tagline: 'Play less, win more.',
    systemPrompt: GUARANTEE_PROMPT,
  },
  {
    id: 'professor',
    name: 'Sage',
    title: 'GTO Master',
    description: 'Balanced, mathematical, and unpredictable. The toughest opponent.',
    provider: 'gemini',
    providerLabel: 'Gemini 2.5 Flash Lite',
    providerIcon: '✨',
    avatar: '🎓',
    avatarBg: 'bg-purple-900',
    avatarBorder: 'border-purple-400',
    difficulty: 10,
    tagline: 'Every move is mathematically calculated.',
    systemPrompt: BALANCED_PROMPT,
  },
  {
    id: 'fish',
    name: 'Lucky',
    title: 'Beginner',
    description: 'Plays completely random. Sometimes wins, usually loses!',
    provider: 'random',
    providerLabel: 'Surprise AI',
    providerIcon: '🎲',
    avatar: '🐟',
    avatarBg: 'bg-cyan-900',
    avatarBorder: 'border-cyan-400',
    difficulty: 1,
    tagline: 'Feeling lucky! (Maybe...)',
    systemPrompt: FISH_PROMPT,
  },
];

// ── Card helpers ───────────────────────────────────────────────────────────

function cardToHuman(card: number): string {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  return `${ranks[Math.floor(card / 4)]}${suits[card % 4]}`;
}

function buildPrompt(ctx: GameContext): string {
  const myCardsStr = ctx.myCards.map(cardToHuman).join(', ');
  const boardStr   = ctx.communityCards.length > 0
    ? ctx.communityCards.map(cardToHuman).join(', ')
    : 'Not yet revealed';
  const canCheck    = ctx.callAmount <= 0;
  const minRaise    = ctx.callAmount + 10;
  const actionsAvail = canCheck
    ? `check, bet <EXTRA_AMOUNT>, fold`
    : `fold, call (${ctx.callAmount} chips), raise <EXTRA_AMOUNT>`;

  return `You are playing Texas Hold'em poker. Choose an action.

GAME STATE:
- Community cards (board): ${boardStr}
- Round: ${ctx.round}
- Pot: ${ctx.pot} chips
- Your chips: ${ctx.myChips}
- Opponent chips: ${ctx.opponentChips}
- Extra chips needed to call: ${ctx.callAmount}
- Available actions: ${actionsAvail}

RULE: "amount" = extra chips to ADD to the pot (call=0, bet/raise min=${minRaise}).
If you want to call, return action="call" with amount=0.

Response format (JSON ONLY, nothing else):
{"action":"fold|check|call|bet|raise","amount":0,"reason":"brief explanation"}`;
}

// ── API Callers (via Next.js Route Handlers) ────────────────────────────────

async function callOpenAI(system: string, prompt: string): Promise<BotAction> {
  const res = await fetch('/api/ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, prompt }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseDecision(data.text);
}

async function callClaude(system: string, prompt: string): Promise<BotAction> {
  const res = await fetch('/api/ai/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, prompt }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Claude API error:', { status: res.status, body: errText });
    throw new Error(`Claude ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return parseDecision(data.text);
}

async function callGemini(system: string, prompt: string): Promise<BotAction> {
  const res = await fetch('/api/ai/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, prompt }),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return parseDecision(data.text);
}

// ── Response Parser ────────────────────────────────────────────────────────

function parseDecision(raw: string): BotAction {
  try {
    const match  = raw.match(/\{[\s\S]*\}/);
    const json   = JSON.parse(match ? match[0] : raw);
    const action = (json.action ?? '').toLowerCase().trim();
    const amount = Number(json.amount) || 0;

    switch (action) {
      case 'fold':  return { type: 'fold' };
      case 'check': return { type: 'check' };
      case 'call':  return { type: 'call' };
      case 'bet':   return { type: 'bet',   amount: Math.max(1, amount) };
      case 'raise': return { type: 'raise', amount: Math.max(1, amount) };
      default:      return { type: 'check' };
    }
  } catch {
    return { type: 'check' };
  }
}

// ── Local Fallback ─────────────────────────────────────────────────────────

function localFallback(opponent: AIOpponent, ctx: GameContext): BotAction {
  const r = Math.random();
  const canCheck = ctx.callAmount <= 0;

  if (opponent.provider === 'openai') {
    // risk sever — agresif
    if (canCheck) return r < 0.6 ? { type: 'bet', amount: Math.max(5, Math.floor(ctx.pot * 0.6)) } : { type: 'check' };
    if (r < 0.10) return { type: 'fold' };
    if (r < 0.55) return { type: 'raise', amount: ctx.callAmount + Math.floor(ctx.pot * 0.5) };
    return { type: 'call' };
  }
  if (opponent.provider === 'claude') {
    // garantici — sağlam
    if (canCheck) return r < 0.35 ? { type: 'bet', amount: Math.max(5, Math.floor(ctx.pot * 0.35)) } : { type: 'check' };
    if (r < 0.50) return { type: 'fold' };
    return { type: 'call' };
  }
  if (opponent.provider === 'gemini') {
    // dengeli
    if (canCheck) return r < 0.45 ? { type: 'bet', amount: Math.max(5, Math.floor(ctx.pot * 0.5)) } : { type: 'check' };
    if (r < 0.30) return { type: 'fold' };
    if (r < 0.55) return { type: 'raise', amount: ctx.callAmount + Math.floor(ctx.pot * 0.3) };
    return { type: 'call' };
  }
  // random / fish
  const actions: BotAction[] = [
    { type: 'fold' },
    { type: canCheck ? 'check' : 'call' },
    { type: 'bet', amount: Math.max(5, Math.floor(ctx.pot * (0.2 + Math.random() * 0.8))) },
  ];
  return actions[Math.floor(Math.random() * actions.length)];
}

// ── Public: getAIDecision ──────────────────────────────────────────────────

export async function getAIDecision(
  opponent: AIOpponent,
  ctx: GameContext
): Promise<BotAction> {
  const prompt = buildPrompt(ctx);
  const system = opponent.systemPrompt;

  let provider = opponent.provider;
  if (provider === 'random') {
    // All AI providers are always considered available (keys are server-side only)
    const available = (['openai', 'claude', 'gemini'] as const);
    provider = available[Math.floor(Math.random() * available.length)];
  }

  // Try providers in order; on failure rotate to the next one before falling back locally.
  // `provider` is already resolved (random was picked above), so use it as start of rotation.
  const allProviders = (['openai', 'claude', 'gemini'] as const);
  const startIdx = allProviders.indexOf(provider as 'openai' | 'claude' | 'gemini');
  const rotation: Array<'openai' | 'claude' | 'gemini'> = [
    ...allProviders.slice(startIdx),
    ...allProviders.slice(0, startIdx),
  ];

  for (const p of rotation) {
    try {
      let decision: BotAction;
      switch (p) {
        case 'openai': decision = await callOpenAI(system, prompt); break;
        case 'claude': decision = await callClaude(system, prompt); break;
        case 'gemini': decision = await callGemini(system, prompt); break;
      }
      console.log(
        `🤖 ${opponent.name} (${p}): ${decision!.type}` +
        ('amount' in decision! ? ` ${(decision as {type:string;amount:number}).amount}` : '')
      );
      return decision!;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠️ ${p} API error, trying next provider: ${msg}`);
    }
  }

  console.warn(`⚠️ All AI providers failed, using local fallback`);
  return localFallback(opponent, ctx);
}

// ── LocalStorage Helpers ───────────────────────────────────────────────────

export function getOpponentById(id: string): AIOpponent {
  return AI_OPPONENTS.find(o => o.id === id) ?? AI_OPPONENTS[2];
}

export function loadSelectedOpponent(): AIOpponent {
  if (typeof window === 'undefined') return AI_OPPONENTS[2];
  const id = localStorage.getItem('selected_opponent_id') ?? 'professor';
  return getOpponentById(id);
}

export function saveSelectedOpponent(id: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('selected_opponent_id', id);
  }
}

export function pickRandomOpponent(): AIOpponent {
  return AI_OPPONENTS[Math.floor(Math.random() * AI_OPPONENTS.length)];
}
