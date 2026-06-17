package com.calculator

fun main(args: Array<String>) {
    println("Card Pool is $DECK")

    println("simpleMax(6) average = ${runTrials(SimpleMax(6))}")
    println("simpleMax(7) average = ${runTrials(SimpleMax(7))}")
    println("simpleMax(8) average = ${runTrials(SimpleMax(8))}")
    println("simpleMax(9) average = ${runTrials(SimpleMax(9))}")

    println("safeWhenNoRerolls(6) average = ${runTrials(SafeWhenNoRerolls(6))}")
    println("safeWhenNoRerolls(7) average = ${runTrials(SafeWhenNoRerolls(7))}")
    println("safeWhenNoRerolls(8) average = ${runTrials(SafeWhenNoRerolls(8))}")
    println("safeWhenNoRerolls(9) average = ${runTrials(SafeWhenNoRerolls(9))}")

    println("altMaxWhenNoRerolls(7, 6) average = ${runTrials(AltMaxWhenNoRerolls(7, 6))}")
    println("altMaxWhenNoRerolls(8, 6) average = ${runTrials(AltMaxWhenNoRerolls(8, 6))}")
    println("altMaxWhenNoRerolls(8, 7) average = ${runTrials(AltMaxWhenNoRerolls(8, 7))}")
    println("altMaxWhenNoRerolls(9, 6) average = ${runTrials(AltMaxWhenNoRerolls(9, 6))}")
    println("altMaxWhenNoRerolls(9, 7) average = ${runTrials(AltMaxWhenNoRerolls(9, 7))}")
    println("altMaxWhenNoRerolls(9, 8) average = ${runTrials(AltMaxWhenNoRerolls(9, 8))}")
}

fun List<Int>.toCardPool() =
    this.flatMapIndexed { idx, i -> Array(i) { idx + 1 }.toList() }.toMutableList()

fun List<Int>.toDeck() =
    Array(max()) { i -> this.count { it == i } }

/**
 * Simply draws when the current sum is less or equal to [max]. Does not consider rerolls remaining.
 */
class SimpleMax(max: Int) : Strategy(
    drawStrategy = { it.hand.sum() % 11 <= max },
    rerollStrategy = { it.hand.sum() % 11 <= max },
    doubleStrategy = { true }
)

/**
 * Draws when the current sum is less or equal to [max]. UNLESS there are no rerolls left, in which
 * case always play safe, and only draw up until it is possible to bust (i.e. only draw when < 6).
 */
class SafeWhenNoRerolls(max: Int) : Strategy(
    drawStrategy = {
        if (it.rerolls == 0) {
            it.hand.sum() < 6
        } else {
            it.hand.sum() % 11 <= max
        }
    },
    rerollStrategy = { it.hand.sum() % 11 <= max },
    doubleStrategy = { true }
)


/**
 * Slightly riskier. Draw when the sum is less or equal to [max]. If there are no rerolls left,
 * do the same, but with a lower [altMax] instead.
 */
class AltMaxWhenNoRerolls(max: Int, altMax: Int): Strategy(
    drawStrategy = {
        if (it.rerolls == 0) {
            it.hand.sum() % 11 <= altMax
        } else {
            it.hand.sum() % 11 <= max
        }
    },
    rerollStrategy = { it.hand.sum() % 11 <= max },
    doubleStrategy = { true }
)