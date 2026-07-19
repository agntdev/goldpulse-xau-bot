import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard, confirmKeyboard } from "../toolkit/index.js";

// Positions handler — tracks user positions with real-time P/L.
// Positions are stored in persistent storage. The P/L is calculated
// using the current gold price from the price API.

interface Position {
  id: string;
  side: "long" | "short";
  entryPrice: number;
  size: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: string;
}

// In-memory position store for demo. In production, use persistent storage.
const userPositions = new Map<string, Position[]>();

function getPositions(userId: string): Position[] {
  return userPositions.get(userId) ?? [];
}

function addPosition(userId: string, pos: Position): void {
  const existing = userPositions.get(userId) ?? [];
  existing.push(pos);
  userPositions.set(userId, existing);
}

function removePosition(userId: string, posId: string): boolean {
  const positions = userPositions.get(userId);
  if (!positions) return false;
  const idx = positions.findIndex((p) => p.id === posId);
  if (idx < 0) return false;
  positions.splice(idx, 1);
  if (positions.length === 0) userPositions.delete(userId);
  return true;
}

async function fetchCurrentPrice(): Promise<number> {
  const apiKey = process.env.GOLD_API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }

  const response = await fetch("https://www.goldapi.io/api/XAU/USD", {
    headers: {
      "x-access-token": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`API_ERROR_${response.status}`);
  }

  const data = await response.json() as { price: number };
  return data.price;
}

function calculatePL(side: "long" | "short", entry: number, current: number, size: number): number {
  if (side === "long") {
    return (current - entry) * size;
  }
  return (entry - current) * size;
}

function formatPL(pl: number): string {
  const sign = pl >= 0 ? "+" : "";
  return `${sign}$${pl.toFixed(2)}`;
}

function formatPosition(pos: Position, currentPrice: number): string {
  const pl = calculatePL(pos.side, pos.entryPrice, currentPrice, pos.size);
  const plFormatted = formatPL(pl);
  const emoji = pl >= 0 ? "🟢" : "🔴";
  const sideLabel = pos.side === "long" ? "LONG" : "SHORT";

  return (
    `${emoji} <b>${sideLabel}</b> · ${pos.size} oz\n` +
    `Entry: $${pos.entryPrice.toFixed(2)}\n` +
    `Current: $${currentPrice.toFixed(2)}\n` +
    `P/L: ${plFormatted}\n` +
    `SL: $${pos.stopLoss.toFixed(2)} | TP: $${pos.takeProfit.toFixed(2)}`
  );
}

const composer = new Composer<Ctx>();

registerMainMenuItem({ label: "📋 Positions", data: "positions:show", order: 30 });

composer.command("positions", async (ctx) => {
  await showPositions(ctx);
});

composer.callbackQuery("positions:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showPositions(ctx);
});

composer.callbackQuery("positions:add", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_position_side";
  await ctx.reply("Is this a long or short position?", {
    reply_markup: inlineKeyboard([
      [
        inlineButton("📈 Long", "position:side:long"),
        inlineButton("📉 Short", "position:side:short"),
      ],
      [inlineButton("Cancel", "positions:cancel")],
    ]),
  });
});

composer.callbackQuery(/^position:side:(long|short)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const side = ctx.match[1] as "long" | "short";
  ctx.session.positionSide = side;
  ctx.session.step = "awaiting_position_entry";
  await ctx.reply("What's your entry price?", {
    reply_markup: inlineKeyboard([[inlineButton("Cancel", "positions:cancel")]]),
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_position_entry") return next();

  const text = ctx.message.text.trim();
  const price = parseFloat(text);

  if (isNaN(price) || price <= 0) {
    await ctx.reply("Please enter a valid price (e.g. 2345.50).");
    return;
  }

  ctx.session.positionEntry = price;
  ctx.session.step = "awaiting_position_size";
  await ctx.reply("How many ounces? (e.g. 1, 0.5, 10)", {
    reply_markup: inlineKeyboard([[inlineButton("Cancel", "positions:cancel")]]),
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_position_size") return next();

  const text = ctx.message.text.trim();
  const size = parseFloat(text);

  if (isNaN(size) || size <= 0) {
    await ctx.reply("Please enter a valid size (e.g. 1, 0.5, 10).");
    return;
  }

  ctx.session.positionSize = size;
  ctx.session.step = "awaiting_position_sl";
  await ctx.reply("What's your stop loss price?", {
    reply_markup: inlineKeyboard([[inlineButton("Cancel", "positions:cancel")]]),
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_position_sl") return next();

  const text = ctx.message.text.trim();
  const sl = parseFloat(text);

  if (isNaN(sl) || sl <= 0) {
    await ctx.reply("Please enter a valid stop loss price.");
    return;
  }

  ctx.session.positionSL = sl;
  ctx.session.step = "awaiting_position_tp";
  await ctx.reply("What's your take profit price?", {
    reply_markup: inlineKeyboard([[inlineButton("Cancel", "positions:cancel")]]),
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_position_tp") return next();

  const text = ctx.message.text.trim();
  const tp = parseFloat(text);

  if (isNaN(tp) || tp <= 0) {
    await ctx.reply("Please enter a valid take profit price.");
    return;
  }

  ctx.session.positionTP = tp;
  ctx.session.step = undefined;

  const posId = `pos-${Date.now()}`;
  const position: Position = {
    id: posId,
    side: ctx.session.positionSide!,
    entryPrice: ctx.session.positionEntry!,
    size: ctx.session.positionSize!,
    stopLoss: ctx.session.positionSL!,
    takeProfit: tp,
    openedAt: new Date().toISOString(),
  };

  addPosition(String(ctx.from?.id ?? 0), position);

  const sideLabel = position.side === "long" ? "LONG" : "SHORT";
  await ctx.reply(
    `Position added:\n\n` +
    `<b>${sideLabel}</b> ${position.size} oz @ $${position.entryPrice.toFixed(2)}\n` +
    `SL: $${position.stopLoss.toFixed(2)} | TP: $${position.takeProfit.toFixed(2)}`,
    {
      parse_mode: "HTML",
      reply_markup: inlineKeyboard([
        [inlineButton("📋 View all positions", "positions:show")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

composer.callbackQuery("positions:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = undefined;
  ctx.session.positionSide = undefined;
  ctx.session.positionEntry = undefined;
  ctx.session.positionSize = undefined;
  ctx.session.positionSL = undefined;
  ctx.session.positionTP = undefined;
  await ctx.editMessageText("Position creation cancelled.", {
    reply_markup: inlineKeyboard([
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery(/^position:remove:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const posId = ctx.match[1];
  const userId = String(ctx.from?.id ?? 0);
  const removed = removePosition(userId, posId);

  if (removed) {
    await ctx.editMessageText("Position removed.", {
      reply_markup: inlineKeyboard([
        [inlineButton("📋 View positions", "positions:show")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
  } else {
    await ctx.editMessageText("Couldn't find that position.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
  }
});

async function showPositions(ctx: Ctx) {
  const userId = String(ctx.from?.id ?? 0);
  const positions = getPositions(userId);

  if (positions.length === 0) {
    await ctx.reply(
      "No open positions yet. Tap Add to track a trade.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Add position", "positions:add")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  let currentPrice: number;
  try {
    currentPrice = await fetchCurrentPrice();
  } catch {
    await ctx.reply(
      "Couldn't fetch the current price to calculate P/L. The data service may be temporarily unavailable.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("🔄 Retry", "positions:show")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  const positionTexts = positions.map((p) => formatPosition(p, currentPrice));
  const removeButtons = positions.map((p) => [
    inlineButton(`Remove ${p.id.slice(-3)}`, `position:remove:${p.id}`),
  ]);

  const text = "📋 <b>Your Positions</b>\n\n" + positionTexts.join("\n\n");

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: inlineKeyboard([
      [inlineButton("➕ Add position", "positions:add")],
      ...removeButtons,
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
}

export default composer;
