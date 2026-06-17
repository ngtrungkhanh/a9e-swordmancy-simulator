package com.calculator

import kotlin.random.Random


fun main(args: Array<String>) {
    println("score = ${doDaily(strategy = PerfectStrat(true), true)}")
}

typealias Deck = List<Int>

fun Deck.draw(card: Int): Deck = this.toMutableList().apply { this[card - 1]-- }

fun Deck.probability(card: Int): Double = this[card - 1].toDouble() / this.sum()

typealias Hand = List<Int>

fun Hand.stockBills() = REWARDS[sum() % 11]

val DECK: Deck = listOf(5, 5, 5, 8, 7)
val REWARDS =
    arrayOf(0, 1_000, 2_000, 4_000, 7_500, 12_000, 20_000, 36_000, 60_000, 100_000, 160_000)

data class GameState(
    val deck: Deck,
    val hand: Hand = emptyList(),
    val doubled: Boolean = false,
    val runsLeft: Int = 3,
    val rerolls: Int = 3,
    val doubles: Int = 2,
) {
    fun rerolled() = copy(
        deck = DECK,
        hand = emptyList(),
        doubled = false,
        rerolls = rerolls - 1,
        doubles = doubles + if (doubled) 1 else 0,
    )

    fun nextRun() = copy(
        deck = DECK,
        hand = emptyList(),
        doubled = false,
        runsLeft = runsLeft - 1,
    )

    override fun toString(): String {
        return "(hand = ${hand.toString().padEnd(15)} points=${
            hand.sum().toString().padEnd(2)
        } runsLeft=$runsLeft rerolls=$rerolls doubles=$doubles)"
    }
}

abstract class Strategy(
    val drawStrategy: (GameState) -> Boolean = { false },
    val rerollStrategy: (GameState) -> Boolean = { false },
    val doubleStrategy: (GameState) -> Boolean = { false },
)

fun runTrials(strategy: Strategy, trials: Int = 1_000_000): Int {
    val runs = Array(trials) { doDaily(strategy) }
    return runs.average().toInt()
}

fun doDaily(strategy: Strategy, noisy: Boolean = false): Int {
    var state = GameState(DECK)
    var stockBills = 0
    do {
        state = runStrat(state, strategy)
        if (state.rerolls > 0 && strategy.rerollStrategy(state)) {
            if (noisy) println("Rerolling Run")
            state = state.rerolled()
        } else {
            stockBills += state.hand.stockBills() * (if (state.doubled) 2 else 1)
            if (noisy) println("Rewarding Run ${state.hand.stockBills() * (if (state.doubled) 2 else 1)}")
            state = state.nextRun()
        }
    } while (state.runsLeft > 0)
    return stockBills
}

fun runStrat(initialState: GameState, strategy: Strategy): GameState {
    val cardPool = initialState.deck.toCardPool()
    var state = initialState
    for (i in 0..4) {
        val draw = cardPool.removeAt(cardPool.indices.random())
        state = state.copy(hand = state.hand + draw, deck = state.deck.draw(draw))
        if (!state.doubled && state.hand.size == 2 && state.doubles > 0 && strategy.doubleStrategy(
                state
            )
        ) {
            state = state.copy(doubled = true, doubles = state.doubles - 1)
        }
        if (state.hand.size < 5 && !strategy.drawStrategy(state)) {
            break
        }
    }
    return state
}
