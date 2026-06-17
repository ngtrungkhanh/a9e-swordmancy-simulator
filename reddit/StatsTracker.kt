package com.calculator

class StatsTracker(val compareStrat: Strategy?) {

    val drawMap = Array(101) { 0 to 0 }
    val rerollMap = Array(101) { 0 to 0 }
    val doubleMap = Array(101) { 0 to 0 }

    var drawAgreements = 0
    var rerollAgreements = 0
    var doubleAgreements = 0

    var drawTotal = 0
    var rerollTotal = 0
    var doubleTotal = 0

    fun draw(state: GameState, decision: Boolean) {
        drawTotal++
        val idx = state.hand.sum() + state.rerolls * 25
        val (count, total) = drawMap[idx]
        drawMap[idx] = (if (decision) count + 1 else count) to total + 1
        if (decision == compareStrat?.drawStrategy(state)) {
            drawAgreements++
        }
    }

    fun reroll(state: GameState, decision: Boolean) {
        rerollTotal++
        val idx = state.hand.sum() + state.rerolls * 25
        val (count, total) = rerollMap[idx]
        rerollMap[idx] = (if (decision) count + 1 else count) to total + 1
        if (decision == compareStrat?.drawStrategy(state)) {
            rerollAgreements++
        }
    }

    fun double(state: GameState, decision: Boolean) {
        doubleTotal++
        if (state.runsLeft > state.doubles) {
            val idx = state.hand.sum() + state.rerolls * 25
            val (count, total) = doubleMap[idx]
            doubleMap[idx] = (if (decision) count + 1 else count) to total + 1
        }
        if (decision == compareStrat?.drawStrategy(state)) {
            doubleAgreements++
        }
    }

    fun println() {
        println("Draw Stats ==============================================")
        drawMap.forEachIndexed { index, (count, total) ->
            println("(${index / 25}, ${index % 25}) -> $count / $total  = ${count.toDouble() / total})")
        }
        println("Reroll Stats ==============================================")
        rerollMap.forEachIndexed { index, (count, total) ->
            println("(${index / 25}, ${index % 25}) -> $count / $total  = ${count.toDouble() / total})")
        }
        println("Double Stats ==============================================")
        doubleMap.forEachIndexed { index, (count, total) ->
            println("(${index / 25}, ${index % 25}) -> $count / $total  = ${count.toDouble() / total})")
        }
        if (compareStrat != null) {
            println("Agreement ==============================================")
            println("draw $drawAgreements / $drawTotal = ${drawAgreements.toDouble() / drawTotal}")
            println("reroll $rerollAgreements / $rerollTotal = ${rerollAgreements.toDouble() / rerollTotal}")
            println("double $doubleAgreements / $doubleTotal = ${doubleAgreements.toDouble() / doubleTotal}")
        }
    }
}

class StrategyArgreement(val otherStrat: Strategy) {
    var drawAgreements = 0
    var rerollAgreements = 0
    var doubleAgreements = 0
    var drawTotal = 0
    var rerollTotal = 0
    var doubleTotal = 0

    fun compareDraw(state: GameState, decision: Boolean) {
        if (decision == otherStrat.drawStrategy(state)) {
            drawAgreements++
        }
        drawTotal++
    }

    fun compareReroll(state: GameState, decision: Boolean) {
        if (decision == otherStrat.rerollStrategy(state)) {
            rerollAgreements++
        }
        rerollTotal++
    }

    fun compareDouble(state: GameState, decision: Boolean) {
        if (decision == otherStrat.doubleStrategy(state)) {
            doubleAgreements++
        }
        doubleTotal++
    }
}