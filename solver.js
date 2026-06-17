/**
 * solver.js
 * Trial of Swordmancy (选剑演武) - Arknights: Endfield (A9E)
 * Mathematical Solver (Dynamic Programming) & Monte Carlo Simulator
 */

const REWARDS = {
    1: [0, 500, 800, 1200, 2000, 3000, 5000, 8000, 12000, 20000, 30000],
    2: [0, 750, 1500, 2400, 3600, 6000, 10000, 16000, 24000, 40000, 60000],
    3: [0, 1000, 2000, 4000, 6000, 10000, 15000, 25000, 40000, 60000, 100000],
    4: [0, 1000, 2000, 4000, 7500, 12000, 20000, 36000, 60000, 100000, 160000]
};

const DOUBLE_LIMITS = {
    0: 0,
    1: 0,
    2: 1,
    3: 2,
    4: 2
};

class SwordmancySolver {
    /**
     * @param {Object} deck - Initial deck configuration, e.g. {1: 3, 2: 3, 3: 3, 4: 2, 5: 2}
     * @param {number} level - Arena Level (1-4)
     */
    constructor(deck = {1: 3, 2: 3, 3: 3, 4: 2, 5: 2}, level = 4) {
        this.deck = { ...deck };
        this.level = level;
        this.rewards = REWARDS[level] || REWARDS[4];
        this.memo = {};
    }

    /**
     * Resets the memoization cache. Call this if deck or level changes.
     */
    resetCache() {
        this.memo = {};
    }

    /**
     * Get sorted string representation of a hand
     * @param {Array<number>} hand 
     * @returns {string}
     */
    getHandKey(hand) {
        return [...hand].sort((a, b) => a - b).join(',');
    }

    /**
     * Computes the remaining counts of cards in the deck
     * @param {Array<number>} hand 
     * @returns {Object} remaining cards
     */
    getRemainingDeck(hand) {
        const remaining = { ...this.deck };
        for (const card of hand) {
            if (remaining[card] > 0) {
                remaining[card]--;
            }
        }
        return remaining;
    }

    /**
     * Calculates the running score and number of overflows for a hand
     * @param {Array<number>} hand 
     * @returns {Object} { score, overflows }
     */
    getHandScore(hand) {
        const sum = hand.reduce((acc, val) => acc + val, 0);
        const score = sum % 11;
        const overflows = Math.floor(sum / 11);
        return { score, overflows };
    }

    /**
     * Bellman Equation solver using Memoized Recursion
     * @param {number} a - remaining rewarded attempts (0-3)
     * @param {number} f - remaining free abandons (0-3)
     * @param {number} d - remaining doubling attempts (0-2)
     * @param {Array<number>} hand - current drawn cards
     * @param {boolean} doubled - whether doubling is active
     * @returns {number} expected value (EV)
     */
    solve(a, f, d, hand, doubled) {
        if (a <= 0) return 0;

        const { score, overflows } = this.getHandScore(hand);

        const handKey = this.getHandKey(hand);
        const stateKey = `${a},${f},${d},${handKey},${doubled ? 1 : 0}`;

        if (stateKey in this.memo) {
            return this.memo[stateKey];
        }

        // We can draw as long as we have less than 5 cards
        const canDraw = hand.length < 5;

        // 1. Value of Stop (Stop & Fight)
        let valStop = -Infinity;
        if (hand.length > 0) {
            const reward = this.rewards[score] || 0;
            const currentReward = reward * (doubled ? 2 : 1);
            valStop = currentReward + this.solve(a - 1, f, d, [], false);
        }

        // 2. Value of Abandon
        let valAbandon = -Infinity;
        if (hand.length > 0 && f > 0) {
            const refundedD = d + (doubled ? 1 : 0);
            valAbandon = this.solve(a, f - 1, refundedD, [], false);
        }

        // 3. Value of Draw
        let valDraw = -Infinity;
        if (canDraw) {
            const remaining = this.getRemainingDeck(hand);
            const totalRemaining = Object.values(remaining).reduce((acc, val) => acc + val, 0);

            if (totalRemaining > 0) {
                let sumDrawEV = 0;
                for (let v = 1; v <= 5; v++) {
                    const count = remaining[v] || 0;
                    if (count > 0) {
                        const prob = count / totalRemaining;
                        const nextHand = [...hand, v];
                        sumDrawEV += prob * this.solve(a, f, d, nextHand, doubled);
                    }
                }
                valDraw = sumDrawEV;
            }
        }

        // 4. Value of Double
        let valDouble = -Infinity;
        if (hand.length === 2 && !doubled && d > 0) {
            valDouble = this.solve(a, f, d - 1, hand, true);
        }

        // The optimal value is the maximum of all valid actions
        const bestVal = Math.max(valStop, valAbandon, valDraw, valDouble);
        this.memo[stateKey] = bestVal;
        return bestVal;
    }

    /**
     * Gets the best action and detailed EVs for the current state
     * @param {number} a - attempts left
     * @param {number} f - free abandons left
     * @param {number} d - doubles left
     * @param {Array<number>} hand - current hand
     * @param {boolean} doubled - is doubled
     * @returns {Object} advice details
     */
    getBestAction(a, f, d, hand, doubled) {
        const { score, overflows } = this.getHandScore(hand);
        if (a <= 0) {
            return { action: 'None', ev: 0, details: {} };
        }

        const remaining = this.getRemainingDeck(hand);
        const totalRemaining = Object.values(remaining).reduce((acc, val) => acc + val, 0);
        const canDraw = hand.length < 5 && totalRemaining > 0;

        // Calculate EV of STOP
        let evStop = -Infinity;
        if (hand.length > 0) {
            const reward = this.rewards[score] || 0;
            evStop = reward * (doubled ? 2 : 1) + this.solve(a - 1, f, d, [], false);
        }

        // Calculate EV of ABANDON
        let evAbandon = -Infinity;
        if (hand.length > 0 && f > 0) {
            const refundedD = d + (doubled ? 1 : 0);
            evAbandon = this.solve(a, f - 1, refundedD, [], false);
        }

        // Calculate EV of DRAW
        let evDraw = -Infinity;
        if (canDraw) {
            let sumDrawEV = 0;
            for (let v = 1; v <= 5; v++) {
                const count = remaining[v] || 0;
                if (count > 0) {
                    const prob = count / totalRemaining;
                    const nextHand = [...hand, v];
                    sumDrawEV += prob * this.solve(a, f, d, nextHand, doubled);
                }
            }
            evDraw = sumDrawEV;
        }

        // Calculate EV of DOUBLE
        let evDouble = -Infinity;
        if (hand.length === 2 && !doubled && d > 0) {
            evDouble = this.solve(a, f, d - 1, hand, true);
        }

        // Choose best action. When EVs are effectively tied, prefer the
        // less risky/less committal action so the live assistant stays practical.
        const actionCandidates = [
            { action: 'Stop', ev: evStop },
            { action: 'Abandon', ev: evAbandon },
            { action: 'Double', ev: evDouble },
            { action: 'Draw', ev: evDraw }
        ];
        const bestCandidate = actionCandidates.reduce((best, candidate) => {
            if (candidate.ev === -Infinity) return best;
            if (!best) return candidate;
            return candidate.ev > best.ev + 0.000001 ? candidate : best;
        }, null);

        const bestAction = bestCandidate ? bestCandidate.action : 'None';
        const maxEV = bestCandidate ? bestCandidate.ev : 0;

        // Calculate probability distribution for drawing
        const drawProbs = {};
        if (totalRemaining > 0) {
            for (let v = 1; v <= 5; v++) {
                drawProbs[v] = (remaining[v] || 0) / totalRemaining;
            }
        }

        // Calculate overflow probability (if score + v > 10)
        let overflowProb = 0;
        if (totalRemaining > 0) {
            let overflowCards = 0;
            for (let v = 1; v <= 5; v++) {
                if (score + v > 10) {
                    overflowCards += remaining[v] || 0;
                }
            }
            overflowProb = overflowCards / totalRemaining;
        }

        return {
            action: bestAction,
            ev: maxEV,
            details: {
                evStop: evStop === -Infinity ? null : evStop,
                evDraw: evDraw === -Infinity ? null : evDraw,
                evAbandon: evAbandon === -Infinity ? null : evAbandon,
                evDouble: evDouble === -Infinity ? null : evDouble,
                drawProbs,
                overflowProb,
                totalRemaining
            }
        };
    }

    /**
     * Draws a card randomly from the remaining deck of a hand
     * @param {Array<number>} hand 
     * @returns {number|null} the drawn card value, or null if deck empty
     */
    drawCard(hand) {
        const remaining = this.getRemainingDeck(hand);
        const pool = [];
        for (let v = 1; v <= 5; v++) {
            const count = remaining[v] || 0;
            for (let i = 0; i < count; i++) {
                pool.push(v);
            }
        }
        if (pool.length === 0) return null;
        const idx = Math.floor(Math.random() * pool.length);
        return pool[idx];
    }

    /**
     * Runs Monte Carlo simulation for a specific strategy
     * @param {number} days - number of days to simulate (e.g. 10000)
     * @param {string} strategyType - 'optimal', 'reddit_simple_618k', 'reddit_old_604k', 'simple_max_8', 'no_rerolls', 'no_doubles'
     * @returns {Object} statistics
     */
    runMonteCarlo(days = 10000, strategyType = 'optimal') {
        let totalEarnings = 0;
        let totalTrialsRun = 0;
        let totalOverflows = 0;
        let totalDoubles = 0;
        let totalAbandons = 0;
        const dailyEarningsList = [];

        const defaultDoubles = DOUBLE_LIMITS[this.level] || 0;

        for (let day = 0; day < days; day++) {
            let a = 3; // attempts
            let f = 3; // free abandons
            let d = defaultDoubles; // doubles
            let dayReward = 0;

            while (a > 0) {
                let hand = [];
                let doubled = false;
                let trialActive = true;

                // Loop for a single trial
                while (trialActive) {
                    const { score, overflows } = this.getHandScore(hand);

                    // Draw first card if hand is empty
                    if (hand.length === 0) {
                        const card = this.drawCard(hand);
                        if (card === null) {
                            // Empty deck edge case
                            a--;
                            trialActive = false;
                            break;
                        }
                        hand.push(card);
                        continue;
                    }

                    // Determine action based on strategy
                    let action = 'Draw';

                    if (strategyType === 'optimal') {
                        const advice = this.getBestAction(a, f, d, hand, doubled);
                        action = advice.action;
                    } else if (strategyType === 'no_rerolls') {
                        // Optimal but f is forced to 0
                        const advice = this.getBestAction(a, 0, d, hand, doubled);
                        action = advice.action;
                        if (action === 'Abandon') {
                            action = advice.details.evDraw > advice.details.evStop ? 'Draw' : 'Stop';
                        }
                    } else if (strategyType === 'no_doubles') {
                        // Optimal but d is forced to 0
                        const advice = this.getBestAction(a, f, 0, hand, doubled);
                        action = advice.action;
                    } else if (strategyType === 'reddit_simple_618k') {
                        // AltMaxWhenNoRerolls(9, 8) - Draw/reroll except on 10, unless out of rerolls (f === 0) in which case accept 9 as well.
                        if (hand.length === 2 && !doubled && d > 0 && a >= 2) {
                            action = 'Double';
                        } else {
                            if (f > 0) {
                                action = (score === 10) ? 'Stop' : 'Draw';
                            } else {
                                action = (score >= 9) ? 'Stop' : 'Draw';
                            }
                        }
                    } else if (strategyType === 'reddit_improved_621k') {
                        // Improved Reddit Strategy (621k) - Accounting for 4th card risk.
                        if (hand.length === 2 && !doubled && d > 0 && a >= 2) {
                            action = 'Double';
                        } else {
                            const hSize = hand.length;
                            if (f > 0) {
                                const thresh = (hSize === 4) ? 9 : 10;
                                action = (score >= thresh) ? 'Stop' : 'Draw';
                            } else {
                                const thresh = (hSize === 4) ? 8 : 9;
                                action = (score >= thresh) ? 'Stop' : 'Draw';
                            }
                        }
                    } else if (strategyType === 'simple_max_8') {
                        // SimpleMax(8) - Always draw/reroll when score <= 8 (stops on 9 or 10)
                        if (hand.length === 2 && !doubled && d > 0 && a >= 2) {
                            action = 'Double';
                        } else {
                            action = (score >= 9) ? 'Stop' : 'Draw';
                        }
                    }

                    // Check if deck is empty and action is Draw
                    if (action === 'Draw') {
                        const remaining = this.getRemainingDeck(hand);
                        const totalRemaining = Object.values(remaining).reduce((acc, val) => acc + val, 0);
                        if (totalRemaining === 0) {
                            // Deck ran out - evaluate final action
                            if (strategyType.startsWith('reddit_') || strategyType === 'simple_max_8') {
                                let shouldAbandon = false;
                                if (strategyType === 'reddit_simple_618k' && score < 10 && f > 0) shouldAbandon = true;
                                if (strategyType === 'reddit_improved_621k') {
                                    const thresh = (hand.length === 4) ? 9 : 10;
                                    if (score < thresh && f > 0) shouldAbandon = true;
                                }
                                if (strategyType === 'simple_max_8' && score < 9 && f > 0) shouldAbandon = true;
                                action = shouldAbandon ? 'Abandon' : 'Stop';
                            } else {
                                const advice = this.getBestAction(a, f, d, hand, doubled);
                                action = advice.action;
                            }
                        }
                    }

                    // Execute action
                    if (action === 'Double') {
                        doubled = true;
                        d--;
                        totalDoubles++;
                        continue;
                    } else if (action === 'Stop') {
                        if (overflows > 0) {
                            totalOverflows += overflows;
                        }
                        const reward = this.rewards[score] || 0;
                        dayReward += reward * (doubled ? 2 : 1);
                        a--;
                        totalTrialsRun++;
                        trialActive = false;
                    } else if (action === 'Abandon') {
                        totalAbandons++;
                        if (doubled) {
                            d++; // Refund double attempt
                        }
                        f--;
                        trialActive = false; // reset deck, start new trial
                    } else {
                        // Draw
                        const card = this.drawCard(hand);
                        hand.push(card);

                        // Check if we hit 5 cards after drawing
                        if (hand.length === 5) {
                            let finalAction = 'Stop';
                            const finalScoreData = this.getHandScore(hand);
                            
                            if (strategyType.startsWith('reddit_') || strategyType === 'simple_max_8') {
                                let shouldAbandon = false;
                                if (strategyType === 'reddit_simple_618k' && finalScoreData.score < 10 && f > 0) shouldAbandon = true;
                                if (strategyType === 'reddit_improved_621k' && finalScoreData.score < 10 && f > 0) shouldAbandon = true;
                                if (strategyType === 'simple_max_8' && finalScoreData.score < 9 && f > 0) shouldAbandon = true;
                                finalAction = shouldAbandon ? 'Abandon' : 'Stop';
                            } else {
                                const advice = this.getBestAction(a, f, d, hand, doubled);
                                finalAction = advice.action;
                            }

                            if (finalAction === 'Abandon') {
                                totalAbandons++;
                                if (doubled) d++;
                                f--;
                            } else {
                                if (finalScoreData.overflows > 0) {
                                    totalOverflows += finalScoreData.overflows;
                                }
                                const reward = this.rewards[finalScoreData.score] || 0;
                                dayReward += reward * (doubled ? 2 : 1);
                                a--;
                                totalTrialsRun++;
                            }
                            trialActive = false;
                        }
                    }
                }
            }
            totalEarnings += dayReward;
            dailyEarningsList.push(dayReward);
        }

        const avgEarnings = totalEarnings / days;
        
        // Compute standard deviation, min, and max
        let varianceSum = 0;
        let minEarnings = Infinity;
        let maxEarnings = -Infinity;
        for (const earn of dailyEarningsList) {
            varianceSum += Math.pow(earn - avgEarnings, 2);
            if (earn < minEarnings) minEarnings = earn;
            if (earn > maxEarnings) maxEarnings = earn;
        }
        const stdDev = Math.sqrt(varianceSum / days);

        return {
            avgEarnings,
            stdDev,
            minEarnings,
            maxEarnings,
            totalOverflows: totalOverflows / days, // average per day
            totalDoubles: totalDoubles / days,
            totalAbandons: totalAbandons / days,
            totalTrialsRun: totalTrialsRun / days,
            rawList: dailyEarningsList
        };
    }
}

// Support CommonJS/Node module and browser ES6/global usage
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = { SwordmancySolver, REWARDS, DOUBLE_LIMITS };
} else {
    window.SwordmancySolver = SwordmancySolver;
    window.REWARDS = REWARDS;
    window.DOUBLE_LIMITS = DOUBLE_LIMITS;
}
