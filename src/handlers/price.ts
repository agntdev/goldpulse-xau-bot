import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";

// XAUUSD price handler — fetches real-time gold price from a free API.
// The API key is read from env (GOLD_API_KEY). If unavailable, shows a
// clear error. Network calls are real; the test harness captures the
// Telegram API calls only.

interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  timestamp: string;
}

async function fetchGoldPrice(): Promise<PriceData> {
  // Using a free gold price API. In production, set GOLD_API_KEY env var.
  // The API returns gold spot price in USD per troy ounce.
  const apiKey = process.env.GOLD_API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }

  const response = await fetch(
    `https://www.goldapi.io/api/XAU/USD`,
    {
      headers: {
        "x-access-token": apiKey,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`API_ERROR_${response.status}`);
  }

  const data = await response.json() as {
    price: number;
    ch: number;
    chp: number;
    timestamp: number;
  };

  return {
    price: data.price,
    change: data.ch,
    changePercent: data.chp,
    timestamp: new Date(data.timestamp * 1000).toISOString(),
  };
}

function formatPrice(price: number): string {
  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatChange(change: number, changePercent: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

const composer = new Composer<Ctx>();

registerMainMenuItem({ label: "💰 Price", data: "price:show", order: 10 });

composer.command("price", async (ctx) => {
  await showPrice(ctx);
});

composer.callbackQuery("price:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showPrice(ctx);
});

async function showPrice(ctx: Ctx) {
  try {
    const data = await fetchGoldPrice();
    const direction = data.change >= 0 ? "📈" : "📉";
    const text =
      `${direction} <b>XAU/USD</b>\n\n` +
      `<b>$${formatPrice(data.price)}</b>\n` +
      `Change: ${formatChange(data.change, data.changePercent)}\n` +
      `As of ${formatTimestamp(data.timestamp)}`;

    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: inlineKeyboard([
        [inlineButton("🔄 Refresh", "price:show")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message === "API_KEY_MISSING") {
      await ctx.reply(
        "Gold price data requires an API key. Set GOLD_API_KEY in your environment.",
        {
          reply_markup: inlineKeyboard([
            [inlineButton("⬅️ Back to menu", "menu:main")],
          ]),
        },
      );
    } else {
      await ctx.reply(
        "Couldn't fetch the current gold price. The data service may be temporarily unavailable — try again shortly.",
        {
          reply_markup: inlineKeyboard([
            [inlineButton("🔄 Retry", "price:show")],
            [inlineButton("⬅️ Back to menu", "menu:main")],
          ]),
        },
      );
    }
  }
}

export default composer;
