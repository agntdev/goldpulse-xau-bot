import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";

// Chart handler — generates a text-based price chart for XAUUSD.
// Uses the same price API as the price handler. The chart is rendered
// as a simple ASCII visualization with timeframe selection.

interface CandleData {
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
}

async function fetchCandleData(timeframe: string): Promise<CandleData[]> {
  const apiKey = process.env.GOLD_API_KEY;
  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }

  // Map timeframe to API parameters
  const tfMap: Record<string, { interval: string; period: string }> = {
    "1h": { interval: "1HOUR", period: "24" },
    "4h": { interval: "4HOUR", period: "30" },
    "1d": { interval: "1DAY", period: "30" },
    "1w": { interval: "1WEEK", period: "12" },
  };

  const tf = tfMap[timeframe] ?? tfMap["1d"];

  const response = await fetch(
    `https://www.goldapi.io/api/XAU/USD/candle/${tf.interval}/${tf.period}`,
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
    candles: Array<{
      c: number;
      h: number;
      l: number;
      o: number;
      t: number;
    }>;
  };

  return data.candles.map((c) => ({
    open: c.o,
    high: c.h,
    low: c.l,
    close: c.c,
    timestamp: c.t,
  }));
}

function renderChart(candles: CandleData[], timeframe: string): string {
  if (candles.length === 0) {
    return "No chart data available for this timeframe.";
  }

  const closes = candles.map((c) => c.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;

  const height = 8;
  const width = Math.min(candles.length, 20);
  const step = Math.max(1, Math.floor(candles.length / width));

  const chart: string[][] = [];
  for (let row = 0; row < height; row++) {
    chart.push(new Array(width).fill(" "));
  }

  for (let i = 0; i < width; i++) {
    const candleIdx = Math.min(i * step, candles.length - 1);
    const price = closes[candleIdx];
    const row = Math.round(((price - min) / range) * (height - 1));
    const displayRow = height - 1 - row;
    chart[displayRow][i] = "●";
  }

  const lines: string[] = [];
  lines.push(`<b>XAU/USD — ${timeframe} chart</b>`);
  lines.push("");

  for (let row = 0; row < height; row++) {
    const priceLabel = row === 0
      ? `$${max.toFixed(0)}`
      : row === height - 1
        ? `$${min.toFixed(0)}`
        : "";
    lines.push(`${priceLabel.padStart(7)} | ${chart[row].join("")}`);
  }

  lines.push(`${"".padStart(7)} └${"─".repeat(width)}`);
  lines.push("");
  lines.push(`Range: $${min.toFixed(2)} – $${max.toFixed(2)}`);
  lines.push(`Candles: ${candles.length}`);

  return lines.join("\n");
}

const composer = new Composer<Ctx>();

registerMainMenuItem({ label: "📊 Chart", data: "chart:show", order: 15 });

composer.command("chart", async (ctx) => {
  await ctx.reply("Pick a timeframe for the chart:", {
    reply_markup: inlineKeyboard([
      [
        inlineButton("1h", "chart:1h"),
        inlineButton("4h", "chart:4h"),
        inlineButton("1d", "chart:1d"),
        inlineButton("1w", "chart:1w"),
      ],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery("chart:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("Pick a timeframe for the chart:", {
    reply_markup: inlineKeyboard([
      [
        inlineButton("1h", "chart:1h"),
        inlineButton("4h", "chart:4h"),
        inlineButton("1d", "chart:1d"),
        inlineButton("1w", "chart:1w"),
      ],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.callbackQuery(/^chart:(1h|4h|1d|1w)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const timeframe = ctx.match[1];

  try {
    const candles = await fetchCandleData(timeframe);
    const chartText = renderChart(candles, timeframe);

    await ctx.reply(chartText, {
      parse_mode: "HTML",
      reply_markup: inlineKeyboard([
        [
          inlineButton("1h", "chart:1h"),
          inlineButton("4h", "chart:4h"),
          inlineButton("1d", "chart:1d"),
          inlineButton("1w", "chart:1w"),
        ],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
  } catch (err) {
    const message = (err as Error).message;
    if (message === "API_KEY_MISSING") {
      await ctx.reply(
        "Chart data requires an API key. Set GOLD_API_KEY in your environment.",
        {
          reply_markup: inlineKeyboard([
            [inlineButton("⬅️ Back to menu", "menu:main")],
          ]),
        },
      );
    } else {
      await ctx.reply(
        "Couldn't load chart data right now. The data service may be temporarily unavailable — try again shortly.",
        {
          reply_markup: inlineKeyboard([
            [inlineButton("🔄 Retry", `chart:${timeframe}`)],
            [inlineButton("⬅️ Back to menu", "menu:main")],
          ]),
        },
      );
    }
  }
});

export default composer;
