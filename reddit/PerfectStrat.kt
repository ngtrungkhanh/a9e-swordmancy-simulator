package com.calculator

fun main(args: Array<String>) {
    println("Card Pool is $DECK")

    val testStrat = AltMaxWhenNoRerolls(9, 8)
    println("testStrat average = ${runTrials(testStrat)}")

    val stats = StatsTracker(testStrat)
    val perfect = PerfectStrat(stats = stats)
    println("optimalStrat average = ${runTrials(perfect)}")
}

val CACHE = mutableMapOf<GameState, Double>()

fun GameState.currentEV() =
    hand.stockBills() * (if (doubled) 2 else 1) + expectedStockBills(this.nextRun())

fun GameState.drawEV() = when {
    hand.size == 5 -> Double.MIN_VALUE
    else -> (1..5).sumOf { card ->
        expectedStockBills(
            this.copy(
                deck = deck.draw(card),
                hand = (hand + card).sorted(),
            )
        ) * deck.probability(card)
    }
}

fun GameState.rerollEV() = when {
    rerolls == 0 -> Double.MIN_VALUE
    else -> expectedStockBills(this.rerolled())
}

fun GameState.doubleEV() = when {
    doubles == 0 -> Double.MIN_VALUE
    else -> expectedStockBills(this.copy(doubled = true, doubles = doubles - 1))
}

fun expectedStockBills(state: GameState): Double {
    return when {
        state.runsLeft == 0 -> 0.0
        CACHE.contains(state) -> CACHE[state]!!
        else -> when {
            state.hand.isEmpty() -> state.drawEV()
            state.hand.size == 2 && !state.doubled ->
                maxOf(state.currentEV(), state.drawEV(), state.rerollEV(), state.doubleEV())

            else -> maxOf(state.currentEV(), state.drawEV(), state.rerollEV())
        }
    }.also { CACHE[state] = it }
}

class PerfectStrat(val noisy: Boolean = false, val stats: StatsTracker? = null) : Strategy(
    drawStrategy = { state ->
        (state.drawEV() > state.currentEV())
            .also {
                if (noisy) println("$state draw = $it")
                stats?.draw(state, it)
            }
    },
    rerollStrategy = { state ->
        (state.rerollEV() > state.currentEV())
            .also {
                if (noisy) println("$state reroll = $it")
                stats?.reroll(state, it)
            }
    },
    doubleStrategy = { state ->
        (state.doubleEV() > state.currentEV() && state.doubleEV() > state.drawEV())
            .also {
                if (noisy) println("$state double = $it")
                stats?.double(state, it)
            }
    }
) {
    init {
        // Pre-warm cache
        expectedStockBills(GameState(DECK))
    }
}
