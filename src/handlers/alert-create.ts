import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";

// Alert creation handler — multi-step flow for setting up price alerts.
// Users specify a price threshold, direction (above/below), and recurrence.
// Alerts are stored in persistent storage.

interface Alert {
  id: string;
  price: number;
  direction: "above" | "below";
  type: "once" | "recurring";
  active: boolean;
  createdAt: string;
}

// In-memory alert store for demo. In production, use persistent storage.
const userAlerts = new Map<string, Alert[]>();

function getAlerts(userId: string): Alert[] {
  return userAlerts.get(userId) ?? [];
}

function addAlert(userId: string, alert: Alert): void {
  const existing = userAlerts.get(userId) ?? [];
  existing.push(alert);
  userAlerts.set(userId, existing);
}

function removeAlert(userId: string, alertId: string): boolean {
  const alerts = userAlerts.get(userId);
  if (!alerts) return false;
  const idx = alerts.findIndex((a) => a.id === alertId);
  if (idx < 0) return false;
  alerts.splice(idx, 1);
  if (alerts.length === 0) userAlerts.delete(userId);
  return true;
}

const composer = new Composer<Ctx>();

registerMainMenuItem({ label: "🔔 Alert", data: "alert:create", order: 35 });

composer.callbackQuery("alert:create", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "awaiting_alert_price";
  await ctx.reply(
    "What price should trigger the alert?\n\nEnter a number like 2345.50.",
    {
      reply_markup: inlineKeyboard([
        [inlineButton("Cancel", "alert:cancel")],
      ]),
    },
  );
});

composer.callbackQuery("alerts:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showAlerts(ctx);
});

composer.callbackQuery(/^alert:remove:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const alertId = ctx.match[1];
  const userId = String(ctx.from?.id ?? 0);
  const removed = removeAlert(userId, alertId);

  if (removed) {
    await ctx.editMessageText("Alert deleted.", {
      reply_markup: inlineKeyboard([
        [inlineButton("🔔 View alerts", "alerts:show")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
  } else {
    await ctx.editMessageText("Couldn't find that alert.", {
      reply_markup: inlineKeyboard([
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    });
  }
});

composer.callbackQuery("alert:cancel", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = undefined;
  ctx.session.alertPrice = undefined;
  ctx.session.alertDirection = undefined;
  ctx.session.alertType = undefined;
  await ctx.editMessageText("Alert creation cancelled.", {
    reply_markup: inlineKeyboard([
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

composer.on("message:text", async (ctx, next) => {
  if (ctx.session.step !== "awaiting_alert_price") return next();

  const text = ctx.message.text.trim();
  const price = parseFloat(text);

  if (isNaN(price) || price <= 0) {
    await ctx.reply("Please enter a valid price (e.g. 2345.50).");
    return;
  }

  ctx.session.alertPrice = price;
  ctx.session.step = "awaiting_alert_direction";

  await ctx.reply(
    `Alert when XAU/USD goes above or below $${price.toFixed(2)}?`,
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton("📈 Above", "alert:dir:above"),
          inlineButton("📉 Below", "alert:dir:below"),
        ],
        [inlineButton("Cancel", "alert:cancel")],
      ]),
    },
  );
});

composer.callbackQuery(/^alert:dir:(above|below)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const direction = ctx.match[1] as "above" | "below";
  ctx.session.alertDirection = direction;
  ctx.session.step = "awaiting_alert_type";

  const dirLabel = direction === "above" ? "above" : "below";
  await ctx.reply(
    `Should this alert fire once or every time the price goes ${dirLabel} $${ctx.session.alertPrice?.toFixed(2)}?`,
    {
      reply_markup: inlineKeyboard([
        [
          inlineButton("Once", "alert:type:once"),
          inlineButton("Recurring", "alert:type:recurring"),
        ],
        [inlineButton("Cancel", "alert:cancel")],
      ]),
    },
  );
});

composer.callbackQuery(/^alert:type:(once|recurring)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const type = ctx.match[1] as "once" | "recurring";
  ctx.session.alertType = type;
  ctx.session.step = undefined;

  const alertId = `alert-${Date.now()}`;
  const alert: Alert = {
    id: alertId,
    price: ctx.session.alertPrice!,
    direction: ctx.session.alertDirection!,
    type,
    active: true,
    createdAt: new Date().toISOString(),
  };

  addAlert(String(ctx.from?.id ?? 0), alert);

  const dirEmoji = alert.direction === "above" ? "📈" : "📉";
  const typeLabel = alert.type === "once" ? "once" : "recurring";

  await ctx.reply(
    `Alert set:\n\n` +
    `${dirEmoji} <b>${alert.direction.toUpperCase()}</b> $${alert.price.toFixed(2)}\n` +
    `Type: ${typeLabel}`,
    {
      parse_mode: "HTML",
      reply_markup: inlineKeyboard([
        [inlineButton("🔔 View all alerts", "alerts:show")],
        [inlineButton("➕ Create another", "alert:create")],
        [inlineButton("⬅️ Back to menu", "menu:main")],
      ]),
    },
  );
});

async function showAlerts(ctx: Ctx) {
  const userId = String(ctx.from?.id ?? 0);
  const alerts = getAlerts(userId);

  if (alerts.length === 0) {
    await ctx.reply(
      "No alerts set yet. Tap Create Alert to set one up.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("➕ Create Alert", "alert:create")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  const alertTexts = alerts.map((a) => {
    const emoji = a.direction === "above" ? "📈" : "📉";
    const typeLabel = a.type === "once" ? "once" : "recurring";
    return (
      `${emoji} <b>${a.direction.toUpperCase()}</b> $${a.price.toFixed(2)} · ${typeLabel}`
    );
  });

  const removeButtons = alerts.map((a) => [
    inlineButton(`Remove $${a.price.toFixed(0)}`, `alert:remove:${a.id}`),
  ]);

  const text = "🔔 <b>Your Alerts</b>\n\n" + alertTexts.join("\n");

  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: inlineKeyboard([
      [inlineButton("➕ Create Alert", "alert:create")],
      ...removeButtons,
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
}

export default composer;
