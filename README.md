# ACP-273 Validator Equilibrium Model

An interactive simulation tool for analyzing the security implications of [ACP-273](https://github.com/avalanche-foundation/ACPs/blob/main/ACPs/273-reduce-min-staking-period/README.md) (Reduce Minimum Validator Staking Period to 24 Hours) in combination with [ACP-236](https://github.com/avalanche-foundation/ACPs/blob/main/ACPs/236-auto-renewed-staking/README.md) (Auto-Renewed Staking) on the Avalanche Primary Network.

**Live Demo:** [acp273-model.vercel.app](https://acp273-model.vercel.app)

## The Problem

ACP-273 proposes reducing the minimum validator staking period from 14 days to 24 hours. Combined with ACP-236's auto-renewal mechanism, this means validators could maintain perpetual staking with a 24-hour exit window — maximum flexibility at potentially minimal reward cost.

The security concern: if the reward differential between short and long staking periods is insufficient, rational validators may overwhelmingly converge on 24-hour auto-renewed stakes. If more than **33% of total stake weight** ends up at 24-hour durations, the entire validator set securing the network could theoretically rotate within a single day, threatening consensus safety.

The key lever available is the **MinConsumptionRate** parameter in Avalanche's reward formula. This model helps determine what value of MinConsumptionRate creates sufficient incentive for longer staking commitments while still making 24-hour staking viable.

## How the Reward Formula Works

Avalanche's staking reward uses an `EffectiveConsumptionRate` that linearly interpolates between `MinConsumptionRate` and `MaxConsumptionRate` based on staking duration:

```
EffectiveConsumptionRate = MinRate × (1 − StakingPeriod/MintingPeriod) + MaxRate × (StakingPeriod/MintingPeriod)
```

Where `MintingPeriod` = 365 days. Current mainnet parameters:

| Parameter | Current Value |
|---|---|
| MinConsumptionRate | 10% |
| MaxConsumptionRate | 12% |
| MinStakeDuration | 14 days |
| MaxStakeDuration | 365 days |

With only a 2 percentage point spread between min (10%) and max (12%), the APY difference between a 14-day stake and a 365-day stake is approximately **0.04 percentage points** — effectively zero incentive to stake longer.

## Calibration Data

The model is calibrated using P-Chain validator data from the Avalanche datalake (`delta.lakehouse.validators`), covering 13,773 `AddPermissionlessValidatorTx` transactions over the last 365 days. The current active validator set is approximately 709 validators; the larger transaction dataset captures staking behavior across rotation and re-staking cycles.

### Observed Validator Duration Distribution

| Duration | % by Count | % by Stake Weight |
|---|---|---|
| 14 days (minimum) | 33.0% | **6.0%** |
| 15–30 days | 39.9% | 43.3% |
| 31–60 days | 11.8% | 18.5% |
| 61–90 days | 4.2% | 9.2% |
| 91–180 days | 3.5% | 6.7% |
| 181–270 days | 0.6% | 0.6% |
| 271–365 days | 3.1% | **12.5%** |

**Key insight:** Validators behave very differently from delegators. While 33% of validators by count choose the 14-day minimum, they represent only 6% of total stake weight. Large, high-stake validators strongly prefer longer durations — 47% of stake weight is committed for 31+ days. This inverse correlation between stake size and liquidity preference is a critical feature of the model calibration.

## Model Design

### Validator Population

The model simulates 2,000 validators drawn from a mixture distribution calibrated to match the observed P-Chain data:

| Segment | % of Population | Target Duration | Stake Range | Behavior |
|---|---|---|---|---|
| Annual planners | ~3% | 300–365 days | 200K–1.4M AVAX | Institutional, low flexibility need |
| Semi-annual planners | ~3% | 150–210 days | 50K–550K AVAX | Long-term committed operators |
| Quarterly planners | ~4% | 75–105 days | 30K–330K AVAX | Moderate commitment, business cycle aligned |
| Monthly planners | ~12% | 28–63 days | 20K–270K AVAX | Operational planning horizon |
| Biweekly/short planners | ~33% | 14–32 days | 2K–302K AVAX | Current "minimum plus buffer" crowd |
| Minimum seekers | ~45% | 1–8 days | 2K–32K AVAX | Maximum flexibility, smallest stakes |

### Decision Model

Each validator chooses the staking duration that maximizes their utility function:

```
utility = reward_rate − flexibility_cost − deviation_penalty + proximity_bonus
```

The four components:

#### 1. Reward Rate (APY)

Directly from the Avalanche reward formula. Higher durations earn higher APY based on the `EffectiveConsumptionRate` interpolation between `MinConsumptionRate` and `MaxConsumptionRate`.

#### 2. Flexibility Cost (Option Value of Exit)

Models the economic value of being able to exit a position. A validator locked for 90 days loses the ability to respond to market changes, rebalance capital, or seize opportunities for that period.

The option value uses a **nonlinear uncertainty model** rather than simple linear scaling:

```
optionValue = volatility × √(lockTime) × 0.4 + opportunityCost × lockTime + volatility × lockTime² × 0.15
```

The quadratic term (`lockTime²`) is critical — it captures that uncertainty grows disproportionately with time. A 365-day lock is not merely 4× more uncertain than a 90-day lock; the compounding unknowns (market regime changes, regulatory shifts, protocol upgrades, operational changes) make very long commitments qualitatively different from moderate ones. This prevents the model from producing unrealistic "all or nothing" outcomes where validators either choose 24 hours or 365 days with nothing in between.

Each validator's flexibility cost is scaled by their individual `flexSensitivity` parameter, which is inversely correlated with stake size (large institutional validators have lower sensitivity).

#### 3. Deviation Penalty

Validators have a **natural planning horizon** — a target duration that aligns with their operational reality (infrastructure contracts, reporting periods, funding cycles, business planning cadence). Choosing a duration far from this target incurs a penalty:

```
deviationPenalty = |chosenDuration − targetDuration| / 365 × flexSensitivity × 2.0
```

This captures the fact that even if pure yield optimization says "stake for 365 days," a validator whose infrastructure contracts renew quarterly will prefer ~90 days because it aligns with their operational cadence. The penalty is proportional to both the deviation distance and the validator's flexibility sensitivity.

#### 4. Proximity Bonus

Validators receive a small utility bonus (+0.15) when their chosen duration falls within 70–150% of their target duration. This represents the operational convenience of aligning staking commitments with existing business rhythms — fewer scheduling conflicts, simpler accounting, predictable capital planning.

### Monte Carlo Execution

Each simulation run generates a fresh population of 2,000 validators with stochastic parameters, computes optimal duration choices, and aggregates results. Final outputs are averaged over 8–12 independent runs to smooth stochastic variation.

## Using the Model

### Parameters

Three adjustable parameters control the simulation:

| Parameter | Range | Default | Description |
|---|---|---|---|
| **MinConsumptionRate** | 1%–12% | 6% | The primary lever. Lower values create a steeper reward curve, penalizing short-duration staking. At 12% (= MaxRate), there is no duration-based reward differential at all. Current mainnet value is 10%. |
| **AVAX Volatility** | 10%–80% | 35% | Annualized price volatility of AVAX. Higher volatility increases the option value of exit flexibility, pushing more validators toward shorter durations. 35% is a reasonable mid-range estimate for AVAX. |
| **Alt. DeFi Yield** | 2%–20% | 8% | The opportunity cost of locked capital — what yield a validator could earn elsewhere in DeFi. Higher values make locked staking less attractive relative to flexible alternatives. |

### Views

#### Single Rate Analysis

Shows the projected validator distribution for a specific MinConsumptionRate. Use this to:

- See how stake distributes across durations at your chosen rate
- Toggle between **"By Stake Weight"** (what matters for consensus safety) and **"By Validator Count"** (the raw number of validators)
- Check the safety indicator: green (✅ <33% at 24h), yellow (⚠️ 33–50%), or red (🚨 >50%)
- View the APY for each duration bucket to understand the reward spread

#### Rate Sweep (Find Safe Threshold)

Sweeps MinConsumptionRate from 1% to 12% and shows the percentage of stake at 24-hour durations for each value. Use this to:

- **Identify the safety threshold** — the highest MinConsumptionRate where <33% of stake converges on 24h
- See the detailed table with 24h APY, 365d APY, spread, and both stake-weighted and count-based percentages
- The current mainnet rate (10%) is highlighted in the table for comparison
- Adjust volatility and opportunity cost to stress-test the threshold under different market conditions

#### Scenarios (Before/After Comparison)

Compares four MinConsumptionRate values side-by-side (10%, 8%, 6%, 4%) to visualize the impact of different parameter choices. Use this to:

- See stacked distribution bars showing how stake shifts across durations under each scenario
- Compare APY at 24h, 14d, 90d, and 365d for each scenario
- Quickly assess which rate achieves safety while preserving viable short-term staking yields

## Key Findings

1. **MinConsumptionRate of 10% (current) is unsafe for a 24-hour minimum.** The 0.04pp APY spread provides zero behavioral incentive for longer commitments.

2. **The safety threshold is approximately 5–7%** under normal market conditions (35% volatility, 8% opportunity cost), though it shifts lower under stress.

3. **Stake weight is the correct safety metric, not validator count.** A scenario where many small validators choose 24h but large validators choose longer durations may be acceptable — consensus depends on stake weight.

4. **Avalanche is unique among major PoS chains** in using a duration-based reward curve. Every other major chain (Ethereum, Solana, Cardano, Polkadot, Cosmos, BNB, TRON, NEAR) uses flat reward rates and relies on unbonding periods, slashing, or exit queues for stability instead.

## Limitations

- **Static equilibrium model**, not a dynamic simulation. Does not capture feedback loops, strategic interactions between validators, or time-evolution of the validator set.
- **Simplified option pricing.** The option value model is inspired by Black-Scholes but significantly simplified. A more rigorous approach would use full stochastic calculus with AVAX-specific volatility surfaces.
- **No MEV, fee revenue, or non-economic motivations.** Some validators stake for reasons beyond yield (governance participation, ecosystem commitment, infrastructure access) which would increase tolerance for lower rewards.
- **Population distribution is an estimate.** While calibrated to P-Chain data, the mapping from observed duration choices (under current parameters) to underlying preferences (which would manifest differently under new parameters) involves assumptions about validator motivations.
- **Results are directional, not precise.** Use for identifying the approximate safe range for MinConsumptionRate, not for determining exact parameter values.

## Project Structure

```
acp273-model/
├── index.html          # Entry point
├── package.json        # Dependencies (React, Vite)
├── vite.config.js      # Build configuration
└── src/
    ├── main.jsx        # React mount
    └── App.jsx         # Model and UI (single component)
```

## Development

```bash
npm install
npm run dev       # Local dev server at localhost:5173
npm run build     # Production build to dist/
npm run preview   # Preview production build
```

## Deployment

Deployed on Vercel. Any push to `main` triggers automatic redeployment.

## Related Resources

- [ACP-273: Reduce Minimum Validator Staking Period to 24 Hours](https://github.com/avalanche-foundation/ACPs/blob/main/ACPs/273-reduce-min-staking-period/README.md)
- [ACP-273 Discussion Thread](https://github.com/avalanche-foundation/ACPs/discussions/274)
- [ACP-236: Auto-Renewed Staking](https://github.com/avalanche-foundation/ACPs/blob/main/ACPs/236-auto-renewed-staking/README.md)
- [Avalanche Rewards Formula Documentation](https://build.avax.network/docs/primary-network/validate/rewards-formula)
- [Avalanche Staking Parameters](https://docs.avax.network/avalanche-l1s/elastic-avalanche-l1s/parameters)