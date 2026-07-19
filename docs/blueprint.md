# XAUUSD Market Alerts & Tracking Bot — Bot specification

**Archetype:** finance

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A professional Telegram bot for XAUUSD traders offering real-time price tracking, customizable alerts, trade signal notifications, position management, and a subscription-based premium tier. Users receive timely market data, chart snapshots, and P/L calculations while admins manage signals and payment tiers through a private channel.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Retail forex/commodities traders
- Mobile traders seeking quick insights
- Gold price analysts and hobbyists

## Success criteria

- Real-time price alerts delivered to users
- Accurate position P/L notifications
- Signal push notifications to subscribers
- Functional free/premium tier subscription system
- Chart snapshots generated for requested timeframes

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open onboarding menu with free/premium explanation and alert setup
- **/price** (command, actor: user, command: /price) — Fetch current XAUUSD price with change percentage and timestamp
- **/chart** (command, actor: user, command: /chart) — Generate and send chart image for specified timeframe (1h/4h/1d/1w)
  - inputs: timeframe
  - outputs: chart image
- **/signals** (command, actor: user, command: /signals) — View latest official/algorithmic signals with optional commentary
- **/positions** (command, actor: user, command: /positions) — List tracked positions and current unrealized P/L
- **/help** (command, actor: user, command: /help) — Show command list and usage instructions
- **Create Alert** (button, actor: user, callback: alert:create) — Initiate guided alert setup with price threshold, direction, and recurrence options
  - inputs: price threshold, direction, alert type
  - outputs: confirmation message with alert details

## Flows

### Onboarding
_Trigger:_ /start

1. Welcome message with free/premium features
2. Prompt for alert preferences
3. Store user profile data

_Data touched:_ user profile

### Alert Creation
_Trigger:_ alert:create

1. Request price threshold
2. Confirm direction (up/down)
3. Set recurrence rules
4. Save alert to user profile

_Data touched:_ alert, user profile

### Signal Subscription
_Trigger:_ /signals

1. Display available signals
2. Prompt for subscription tier (free/premium)
3. Update user subscription status

_Data touched:_ signal, user profile

### Position Tracking
_Trigger:_ /positions

1. List existing positions
2. Offer add/edit/remove options
3. Calculate and show P/L

_Data touched:_ position, XAUUSD price feed

### Chart Generation
_Trigger:_ /chart

1. Request timeframe selection
2. Generate chart image with default indicators
3. Send chart to user

_Data touched:_ XAUUSD price feed, chart snapshot

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **user profile** _(retention: persistent)_ — User account information and preferences
  - fields: Telegram user id, username, language, subscription tier, alert preferences
- **XAUUSD price feed** _(retention: session)_ — Timestamped gold price data for real-time tracking
  - fields: timestamp, price, change percentage
- **alert** _(retention: persistent)_ — User-defined price alert rules
  - fields: price threshold, direction, recurrence type, expiration date
- **signal** _(retention: persistent)_ — Official trade signals for subscribers
  - fields: signal type (buy/sell/close), timestamp, commentary
- **position** _(retention: persistent)_ — Tracked user trades with P/L calculation
  - fields: trade side, entry price, position size, stop loss, take-profit
- **chart snapshot** _(retention: session)_ — Generated price chart images
  - fields: timeframe, image data, technical indicators
- **payment record** _(retention: persistent)_ — Subscription payment tracking
  - fields: payment method, amount, subscription status

## Integrations

- **Telegram** (required) — Bot API messaging and payments
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Manage signal content and distribution tiers
- Configure alert evaluation rules
- Monitor active subscriptions and payments
- Access admin channel for error alerts and signal posting

## Notifications

- Price alert notifications with action buttons
- Signal push notifications to subscribers
- Position P/L threshold alerts
- Subscription renewal reminders

## Permissions & privacy

- Secure storage of payment records
- Optional user data collection (language, alert preferences)
- No storage of sensitive financial credentials
- User consent required for signal subscriptions

## Edge cases

- Conflicting price alert thresholds
- Expired alerts needing cleanup
- Users requesting alert modifications during price spikes
- Payment cancellations mid-subscription flow

## Required tests

- End-to-end alert triggering from price feed to notification
- Position P/L calculation accuracy across price movements
- Chart generation for all supported timeframes
- Subscription tier feature restrictions enforcement

## Assumptions

- Market data source will be selected by development team
- Alert evaluation uses server-side tick processing
- Chart images use candlestick format with optional MA overlays
- Admin channel is pre-configured by owner
