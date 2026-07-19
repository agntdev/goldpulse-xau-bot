import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";

// Signals handler — displays trade signals from the signal feed.
// In production, signals are stored in persistent storage and posted
// by admins. For testing, we use static sample data.

interface Signal {
  id: string;
  type: "buy" | "sell" | "close";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  commentary: string;
  timestamp: string;
  tier: "free" | "premium";
}

// Static signals for deterministic testing. In production, load from DB.
const SIGNALS: Signal[] = [
  {
    id: "sig-001",
    type: "buy",
    entry: 2345.50,
    stopLoss: 2335.00,
    takeProfit: 2365.00,
    commentary: "Strong support at $2340, bullish momentum building.",
    timestamp: "2026-07-19T10:00:00Z",
    tier: "free",
  },
  {
    id: "sig-002",
    type: "sell",
    entry: 2355.00,
    stopLoss: 2365.00,
    takeProfit: 2335.00,
    commentary: "Resistance at $2360 holding, expect pullback.",
    timestamp: "2026-07-19T09:00:00Z",
    tier: "free",
  },
  {
    id: "sig-003",
    type: "buy",
    entry: 2340.00,
    stopLoss: 2330.00,
    takeProfit: 2370.00,
    commentary: "Premium signal: Double bottom pattern confirmed on 4H chart.",
    timestamp: "2026-07-19T08:00:00Z",
    tier: "premium",
  },
];

function formatSignal(signal: Signal): string {
  const emoji = signal.type === "buy" ? "🟢" : signal.type === "sell" ? "🔴" : "🟡";
  const label = signal.type.toUpperCase();
  // Use fixed ISO format for deterministic output
  const time = signal.timestamp.replace("T", " ").slice(0, 16) + " UTC";

  return (
    `${emoji} <b>${label}</b> @ $${signal.entry.toFixed(2)}\n` +
    `SL: $${signal.stopLoss.toFixed(2)} | TP: $${signal.takeProfit.toFixed(2)}\n` +
    `${signal.commentary}\n` +
    `<i>${time} · ${signal.tier}</i>`
  );
}

const composer = new Composer<Ctx>();

registerMainMenuItem({ label: "📡 Signals", data: "signals:show", order: 25 });

composer.command("signals", async (ctx) => {
  await showSignals(ctx, "all");
});

composer.callbackQuery("signals:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showSignals(ctx, "all");
});

composer.callbackQuery("signals:free", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showSignals(ctx, "free");
});

composer.callbackQuery("signals:premium", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showSignals(ctx, "premium");
});

async function showSignals(ctx: Ctx, filter: "all" | "free" | "premium") {
  let signals = [...SIGNALS];

  if (filter === "free") {
    signals = signals.filter((s) => s.tier === "free");
  } else if (filter === "premium") {
    signals = signals.filter((s) => s.tier === "premium");
  }

  if (signals.length === 0) {
    await ctx.reply("No signals available right now. Check back soon.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
    return;
  }

  const header = filter === "all"
    ? "📡 <b>Latest Signals</b>"
    : filter === "free"
      ? "📡 <b>Free Signals</b>"
      : "📡 <b>Premium Signals</b>";

  const signalTexts = signals.map(formatSignal);
  const fullText = header + "\n\n" + signalTexts.join("\n\n");

  await ctx.reply(fullText, {
    parse_mode: "HTML",
    reply_markup: inlineKeyboard([
      [
        inlineButton("All", "signals:show"),
        inlineButton("Free", "signals:free"),
        inlineButton("Premium", "signals:premium"),
      ],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
}

export default composer;
