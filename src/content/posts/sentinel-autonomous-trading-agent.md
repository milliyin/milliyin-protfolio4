---
title: Building an Autonomous AI Trading Agent
description: How I built Sentinel, an autonomous on-chain trading agent with a 6-stage governance pipeline, adaptive learning, AI reflection, and a tamper-proof IPFS audit trail on Ethereum Sepolia.
createdAt: 2026-04-21
updatedAt: 2026-04-21
category: AI Agents
readingTime: 5 min read
heroImage: /blog/sentinel-cover.png
heroAlt: Sentinel PRISM Dashboard
tags:
  - Web3
  - AI Agents
  - DeFi
  - Algorithmic Trading
---

![Sentinel PRISM Dashboard](/blog/sentinel-cover.png)

## What If a Trading Bot Could Govern Itself?

Most trading bots are straightforward. They fetch price, check an indicator, place an order, and keep going. If the logic is weak, they still keep going. If performance drifts, nobody really knows why.

I wanted to build something stricter.

Sentinel does not just place trades. It signs decisions, records them on-chain, stores checkpoints on IPFS, reflects on performance with an LLM, and reduces its own risk when the system starts behaving badly.

That was the whole point.

## The Six-Stage Pipeline

Every 60 seconds, across 8 symbols, Sentinel runs through the same pipeline before any trade is allowed through.

**Stage 1 - Oracle.** Fetch live 1-minute candles from Kraken and reject anything stale or incomplete.

**Stage 2 - Signal.** Run three strategies in parallel on every symbol:

- *Order Block (ICT/SMC)* checks for the last bearish candle before bullish displacement, then waits for a retest with extra confirmation.
- *Engulfing at Key Level* looks for engulfing candles at swing highs and lows with a body-to-range filter so weak candles do not slip through.
- *EMA Momentum* compares EMA(20) and EMA(50) with MACD support, but shuts itself down in ranging markets.

Each strategy returns its own confidence score. If two strategies agree, confidence gets a bump. If all three agree, it gets a bigger one.

**Stage 3 - Sentiment.** Fear & Greed and a funding-rate proxy nudge confidence up or down depending on whether the market mood lines up with the signal.

**Stage 4 - Risk Gate.** This is the part that says no.

The gate enforces:

- Maximum 5 open positions
- Daily loss cap of 3% equity
- Maximum drawdown of 10% from peak
- Circuit breaker after three consecutive losses
- Slippage simulation that kills trades with poor edge before they ever reach the exchange

**Stage 5 - Execute.** If the trade survives the gate, the agent places a paper or live order on Kraken and submits an EIP-712 signed `TradeIntent` to the on-chain Risk Router on Sepolia.

**Stage 6 - Record.** A checkpoint is signed, pinned to IPFS through Pinata, and added to a hash chain so every decision can be verified later.

## Trust-Adjusted Sizing

This is probably my favorite part of the whole system.

Sentinel trades smaller when its own recent behavior suggests it should not be trusted with full size.

A trust score tracks accuracy, compliance, data quality, and SAGE confidence. That score maps the agent into a tier from Probation to Elite, with a position size factor between `0.25x` and `1.0x`.

So if the agent has been sloppy, exposure drops automatically. It does not keep swinging full size while it is clearly out of sync with the market.

## CAGE: Adaptive Learning

Every 10 closed trades, Sentinel can adjust a few parameters inside hard limits:

- **Stop-loss ATR multiple** changes if the stop-hit rate gets too high or too low
- **Position size percentage** changes if win rate moves outside acceptable bounds
- **Confidence threshold** changes if false signals start showing up too often

There is also a cooldown period so it does not overreact to a tiny sample.

What I like here is that the system does not just react. It checks whether the change is justified before it commits to it.

There is also a Bayesian context memory that keeps track of which setups have worked better in which market regimes. That history can bias confidence slightly when there is enough data behind it.

## SAGE: Reflection Engine

After each trade, the reflection layer sends recent performance data to the model stack and asks a simple question: what seems to be working, and what is not?

From that, the system generates temporary playbook rules that adjust strategy weights for the next cycle. So instead of hardcoding every rule upfront, the agent can adapt based on what its own history is showing.

That same reflection output also feeds the dashboard narrative, which explains why the last trade was taken or skipped in plain language.

## On-Chain Integration

Sentinel was built for the ERC-8004 hackathon on Ethereum Sepolia.

On startup, the agent:

1. Loads identity from the Agent Registry
2. Claims sandbox capital from the Hackathon Vault
3. Verifies its mandate before trading

Every signal produces a signed `TradeIntent` with a strictly increasing nonce and a short expiry window.

| Contract | Address |
| --- | --- |
| Risk Router | `0xd6A6952545FF6E6E6681c2d15C59f9EB8F40FdBC` |
| Hackathon Vault | `0x0E7CD8ef9743FEcf94f9103033a044caBD45fC90` |
| Agent Registry | `0x97b07dDc405B0c28B17559aFFE63BdB3632d0ca3` |

## MCP Server

Sentinel exposes 18 tools through an MCP server on port `3001`. Any MCP-compatible client can connect and inspect or control the live agent in natural language.

```json
{
  "mcpServers": {
    "sentinel": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

Example session:

```text
You: What signals fired in the last 10 minutes?
Claude: [get_recent_signals] -> BTCUSD order_block 86% buy, ETHUSD engulfing 71% buy

You: What's the current risk state?
Claude: [get_risk_metrics] -> equity=$9,997.48, drawdown=0.03%, 4 open positions, circuit breaker clear

You: Has the agent learned anything from its recent trades?
Claude: [get_adaptation_summary] -> 12 outcomes recorded, SL multiple widened 1.5 to 1.58 after stop-hit rate hit 65%

You: Halt the agent, something looks wrong.
Claude: [halt_agent] -> agent stops taking new trades immediately
```

## The PRISM Dashboard

![PRISM Dashboard - positions, trust tier, and equity overview](/blog/sentinel-dashboard-1.png)

![PRISM Dashboard - system logs and extended positions view](/blog/sentinel-dashboard-2.png)

The dashboard shows equity history, trust tier, strategy scores, the AI narrative, positions, governance pipeline state, checkpoint history, and logs. Everything traces back to signed and pinned checkpoints.

## What I Learned

**Governance matters more than signals.** I spent more time on risk and trust sizing than on the actual entry logic.

**On-chain accountability changes how you write code.** Once every decision is signed and stored, sloppy logic feels a lot less acceptable.

**LLM reflection can be useful when it is constrained.** The regime-aware adjustments were often better than what I would have hardcoded upfront.

**Grace periods matter.** Without a short immunity window on new positions, the agent was stopping out trades that were actually fine because entry-time ticker prices and candle closes did not line up cleanly.

## Stack

TypeScript, Node.js, ethers.js v6, Express, React, Kraken REST, Pinata IPFS, Groq/Gemini, Alternative.me Fear & Greed API, and Railway.

**Source:** [github.com/Quantnet-Lab/sentinel-v3](https://github.com/Quantnet-Lab/sentinel-v3)  
**Dashboard:** [sentinel-v3-production.up.railway.app](https://sentinel-v3-production.up.railway.app)

If you want to see more of my production-minded AI builds, browse the full [AI projects and case studies](/projects) collection.
