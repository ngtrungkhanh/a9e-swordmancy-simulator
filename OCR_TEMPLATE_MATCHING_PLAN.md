# OCR Template Matching Handoff Plan

Date: 2026-06-19
Project: Trial of Swordmancy Live Assistant
Workspace: `d:\A9E App`

This document is a full handoff plan for the next OCR pass. It is written so another agent can continue without relying on chat history.

## 0. Current State Summary

The app is an Electron assistant for Arknights: Endfield Trial of Swordmancy.

Known stable features:

- F4 toggles auto-scan.
- F5 forces one scan.
- Overlay HUD does not steal focus.
- Normal-mode window size is persisted.
- Solver/DP should not be changed for this OCR task.
- Current screenshot debug output is `d:\A9E App\debug_capture.png`.

Important current OCR state:

- `electron/assistant.js` currently keeps card order by scanning fixed 5 slots.
- `scanHandFromSlots()` returns an array of exactly 5 positions, for example `[2, 5, 1, null, null]`.
- `lastScannedSlots` exists and is used for reruns after changing preset/steppers/free-trial.
- `reconcileHandSlots(scannedSlots, deducedHand)` exists and preserves valid OCR slots before filling missing slots from `deducedHand`.
- `DEBUG_SLOT_OCR_ONLY` is currently `true` in `electron/assistant.js`.
- With `DEBUG_SLOT_OCR_ONLY = true`, display uses pure slot OCR, not `deducedHand`.
- This debug mode is intentional for live OCR testing.

Current tested screenshots:

- `Screenshoot\1.png`: no drawn cards; OCR should return empty slots.
- `Screenshoot\2.png`: actual hand is `1 | 3`; OCR currently returns `1 | 3`.
- `Screenshoot\3.png`: actual hand is `1 | 3 | 2 | 5 | 1`; OCR currently returns `1 | 3 | 2 | 5 | 1`.
- `Screenshoot\4.png`: no drawn cards/free-trial start; OCR should return empty slots.
- `debug_capture.png`: recently used live capture; slot 1 contained `5` and OCR recognized it.

## 1. Why The Current OCR Direction Should Change

The slot-preserving pipeline is correct and should stay.

The weak part is the digit classifier:

- The current `classifyDigit(w, h, normGrid)` is a coarse 3x3 grid-density classifier.
- Card BP digits use a large stylized font with glow/outline.
- Digits `1`, `3`, `5`, and `8` can collide in a 3x3 density model.
- Several recent fixes became symptom patches:
  - card-slot `1` sometimes classified as `3`;
  - card-slot `5` sometimes classified as `8`;
  - empty/card-back slots sometimes looked like real digits until a face-slot guard was added.
- More 3x3 exceptions will likely create regressions.

Better direction:

- Treat card BP OCR as a small template-matching problem over only digits `1..5`.
- The game font and card layout are mostly fixed.
- Template matching is more explainable than nested 3x3 rules.
- It can log per-digit scores, making failures obvious.

## 2. Do Not Change These Parts

Do not change solver behavior or DP internals for this OCR task:

- `solver.js`
- Expected value calculation
- reward/overflow/probability logic
- UI layout, unless required only for displaying debug OCR logs

Keep these pipeline decisions:

- Keep fixed 5 card slots.
- Keep `lastScannedSlots`.
- Keep `reconcileHandSlots()` as a fallback layer after OCR improves.
- Keep mid-game fallback:
  - if deck diff/preset is unreliable, display slot OCR and build solver deck from `remainingDeck + hand`.
- Keep the idea that slot OCR decides order.
- Deck-diff `deducedHand` can confirm or fill missing cards, but must not sort/reorder the visible hand.

## 3. Target End State

The target card OCR flow should be:

1. Capture screen.
2. For each of the 5 configured card slots:
   - detect whether the slot is a face-up card;
   - if not face-up, return `null`;
   - crop the BP digit area;
   - segment the digit mask;
   - normalize the mask;
   - compare against templates for digits `1..5`;
   - accept only if confidence and margin are good.
3. Return fixed slots, for example `[2, 5, 1, null, null]`.
4. Compact to hand only at render/solver boundary, for example `[2, 5, 1]`.
5. In normal mode, optionally reconcile missing slots with `deducedHand`.
6. In debug OCR-only mode, display pure OCR output.

## 4. Proposed Files

Recommended new files:

- `electron/ocr/cardTemplates.js`
  - stores or exports normalized templates for digits `1..5`.
- `electron/ocr/cardOcr.js`
  - pure functions for mask creation, component extraction, normalization, scoring, and classification.
- `scripts/test_card_ocr.js`
  - offline screenshot regression runner.

Optional but useful:

- `Screenshoot/card_templates/1.png`
- `Screenshoot/card_templates/2.png`
- `Screenshoot/card_templates/3.png`
- `Screenshoot/card_templates/4.png`
- `Screenshoot/card_templates/5.png`

If image files are inconvenient, templates can be embedded as arrays in `cardTemplates.js`.

## 5. Template Creation Plan

Use real screenshots first. Do not generate synthetic templates unless real samples are unavailable.

Known labeled samples:

- `Screenshoot\2.png`
  - slot 1 = `1`
  - slot 2 = `3`
- `Screenshoot\3.png`
  - slot 1 = `1`
  - slot 2 = `3`
  - slot 3 = `2`
  - slot 4 = `5`
  - slot 5 = `1`
- `debug_capture.png`
  - recent known slot 1 = `5`

Missing/weak samples:

- Need a clean real sample for card digit `4`.
- Need additional samples for `2` and `5` if possible.
- Need at least one screenshot with a partially filled hand and empty/card-back slots after drawn cards.

Template extraction steps:

1. Load screenshot.
2. Use `electron/config.js` card slot positions.
3. Crop each known digit using `cardNumberRelative`.
4. Segment dark/digit pixels.
5. Extract the digit-like connected component.
6. Normalize the component to a fixed canvas, recommended `32x48`.
7. Save the normalized binary mask as:
   - PNG for human inspection; or
   - compact string/array for source control.

Normalization details:

- Preserve aspect ratio.
- Fit component into `32x48` with 2-4 px padding.
- Center horizontally and vertically.
- Use binary mask values `0/1`, not grayscale, for the first implementation.

## 6. Face-Up Slot Detection Plan

Keep the idea from the user's observation:

- Face-up cards have a dark "ACCESS POINT" strip left of the BP digit.
- Empty/card-back slots have pale cyan/white content and/or Chinese text pattern.

Replace hard boolean-only behavior with confidence:

```js
function detectFaceCardSlot(ctx, cardPos) {
    return {
        isFace: boolean,
        confidence: number,
        darkStripPixels: number,
        stripMean: number,
        stripStdDev: number
    };
}
```

Initial implementation can keep a simple threshold, but log enough metrics:

- `darkStripPixels`
- `stripMean`
- `stripStdDev`
- final `isFace`

Suggested crop:

- Start with current strip:
  - `x = cardPos.x`
  - `y = cardPos.y + 10`
  - `w = 300`
  - `h = 50`
- If false positives remain, narrow to the known left strip and avoid the digit itself.

Acceptance:

- `Screenshoot\1.png` and `Screenshoot\4.png` must mark all 5 slots as not face-up.
- `Screenshoot\2.png` must mark first 2 slots as face-up and last 3 as not face-up.
- `Screenshoot\3.png` must mark all 5 slots as face-up.

## 7. Digit Segmentation Plan

Create a card-specific segmentation function:

```js
function createCardDigitMask(cropPixels, cropW, cropH) {
    return {
        mask,
        threshold,
        darkPixels,
        components
    };
}
```

Start simple:

- Convert RGB to luminance: `(r + g + b) / 3`.
- Pixel is digit candidate if luminance is below threshold.
- Use threshold 110 as baseline.

Then improve adaptively:

- Compute crop mean and standard deviation.
- Consider threshold `min(130, mean - 0.55 * stdDev)` if fixed 110 fails.
- Keep exact threshold in logs.

Connected component filtering:

- Use 8-neighbor connectivity.
- Candidate component constraints:
  - `count >= 30`
  - `w >= 4`
  - `h >= 12`
  - `w <= 65`
  - `h <= 80`
- Prefer components near the expected digit region, not lower background details.
- Return a structured reject reason if no component is found.

Important:

- Segmentation should not call the generic `classifyDigit()` anymore.
- Card digit OCR should be independent from deck count OCR.

## 8. Template Matching Algorithm

Recommended function:

```js
function classifyCardDigitByTemplate(componentMask, cropW, cropH) {
    return {
        digit,
        confidence,
        margin,
        scores,
        reason
    };
}
```

Suggested scoring:

1. Normalize input mask to `32x48`.
2. Compare against each digit template `1..5`.
3. Use Intersection over Union (IoU) as first version:
   - `intersection = input && template`
   - `union = input || template`
   - `score = intersection / union`
4. Pick highest score.
5. Compute margin:
   - `margin = bestScore - secondBestScore`

Suggested thresholds:

- `bestScore >= 0.45`
- `margin >= 0.06`

These numbers are starting points. Tune using screenshots.

Log:

```text
Slot 2 Template OCR: digit=5 confidence=0.83 margin=0.18 scores={1:0.31,2:0.42,3:0.58,4:0.35,5:0.83}
```

Reject examples:

- `no face card`
- `no digit component`
- `low score`
- `ambiguous template match`

## 9. Integration Plan In `electron/assistant.js`

Current functions to inspect:

- `classifyDigit(w, h, normGrid)`
- `getGridStatsFromBuffer(cropBuffer, cropW, cropH)`
- `getLargestDigitComponent(cropBuffer, cropW, cropH)`
- `classifyCardDigitFromCrop(cropPixels, cropW, cropH)`
- `isFaceCardSlot(ctx, cardPos)`
- `scanHandFromSlots(ctx, activeConfig)`
- `runSolver(remainingDeck, isDoubled, isFreeTrial, scannedSlots)`

Step-by-step integration:

1. Leave `classifyDigit()` unchanged for deck counts and other small digits.
2. Replace only card-slot OCR internals.
3. Rename current `isFaceCardSlot()` to `detectFaceCardSlot()` or keep wrapper compatibility.
4. Replace `classifyCardDigitFromCrop()` with a template-matching implementation.
5. Keep return shape compatible:

```js
{
    digit,
    darkPixels,
    minX,
    maxX,
    minY,
    maxY,
    w,
    h,
    confidence,
    margin,
    scores,
    reason
}
```

6. Keep `scanHandFromSlots()` returning `Array(5)`.
7. Keep logs concise but complete.

## 10. Debug Mode Plan

Current code:

```js
const DEBUG_SLOT_OCR_ONLY = true;
```

Keep this true while developing template OCR.

After template OCR passes screenshot and live tests:

1. Set `DEBUG_SLOT_OCR_ONLY = false`.
2. Verify normal reconcile mode:
   - OCR slot order is preserved.
   - `deducedHand` only fills missing cards.
   - bad preset/mid-game scans fall back to slot-only.

Longer term:

- Move this to a UI checkbox or localStorage debug setting.
- Avoid editing source just to switch OCR-only mode.

## 11. Offline Test Runner Plan

Add or replace `scripts/test_card_ocr.js`.

It should:

1. Load all known screenshots:
   - `Screenshoot\1.png`
   - `Screenshoot\2.png`
   - `Screenshoot\3.png`
   - `Screenshoot\4.png`
   - optionally `debug_capture.png` if it exists
2. Run the same card-slot OCR functions used by the app.
3. Compare against expected slot arrays.
4. Print per-slot diagnostics.
5. Exit non-zero on mismatch.

Expected cases:

```js
[
  { file: 'Screenshoot/1.png', expected: [null, null, null, null, null] },
  { file: 'Screenshoot/2.png', expected: [1, 3, null, null, null] },
  { file: 'Screenshoot/3.png', expected: [1, 3, 2, 5, 1] },
  { file: 'Screenshoot/4.png', expected: [null, null, null, null, null] }
]
```

Recommended command:

```powershell
npx electron scripts/test_card_ocr.js
```

If possible, keep pure OCR functions in CommonJS-compatible modules so the test can import them without loading the renderer.

## 12. Manual Live Test Plan

Before starting:

- Run PowerShell as Admin.
- Start app from workspace:

```powershell
npx electron .
```

Test cases:

1. No cards drawn:
   - F5 scan.
   - Expected HUD hand: `[ - ]`.
   - Logs should show all slots skipped as not face-up.

2. Draw two cards, example `1 | 3`:
   - F5 scan.
   - Expected HUD/card table: `1 | 3`.
   - No extra phantom card.

3. Draw three cards, especially previous bug case `2 | 5 | 1`:
   - Expected display: `2 | 5 | 1`.
   - Must not become `2 | 1 | 5`.

4. Draw two cards `3 | 1`:
   - Expected display: `3 | 1`.
   - Must not become `3 | 3 | 1`.

5. Full five-card hand:
   - Expected all five cards in left-to-right order.

6. Mid-game unknown preset:
   - Pick a deliberately wrong preset.
   - With OCR-only debug, display must still show scanned cards.
   - With debug off, fallback should use slot-only if deck diff is impossible.

7. Free Trial start:
   - No drawn cards should show empty hand.
   - Free Trial counters should still reset as designed.

## 13. Performance Budget

Expected performance impact is low.

Reason:

- Only 5 card slots.
- Each digit crop is about `75x90`.
- Template matching over 5 templates at `32x48` is tiny.

Rough operations:

- 5 slots x 75 x 90 segmentation = 33,750 pixels.
- 5 slots x 5 templates x 32 x 48 scoring = 38,400 comparisons.
- This is negligible compared with screenshot capture and canvas image extraction.

Goal:

- OCR processing should stay under a few milliseconds on a normal desktop.
- Overall scan time should remain dominated by desktop capture, not template matching.

## 14. Acceptance Criteria

The OCR rewrite is complete only when all are true:

- `node --check electron\assistant.js` passes.
- Offline screenshot runner passes all known cases.
- Live F5 scan correctly shows:
  - empty hand before draw;
  - `1 | 3`;
  - `2 | 5 | 1`;
  - `3 | 1`;
  - a full five-card hand.
- No phantom cards appear from empty/card-back slots.
- Slot order never comes from sorted `deducedHand`.
- `DEBUG_SLOT_OCR_ONLY = false` can be restored without reintroducing the old order bug.
- Logs show enough detail to debug a bad OCR result from one scan.

## 15. Rollback Plan

If template matching performs worse:

1. Keep the slot-preserving pipeline.
2. Revert only the card digit classifier implementation.
3. Do not revert:
   - fixed 5-slot return;
   - `lastScannedSlots`;
   - `reconcileHandSlots`;
   - mid-game slot-only fallback.

The bug fix for order is separate from the OCR classifier and should remain.

## 16. Known Cleanup After OCR Rewrite

After template matching is stable:

- Remove card-specific 3x3 exception rules.
- Consider renaming old `classifyDigit()` to `classifySmallUiDigit()` because it should only handle deck count/header digits.
- Move duplicated OCR helper logic out of `assistant.js` into a small module.
- Turn `DEBUG_SLOT_OCR_ONLY` into a setting or set it back to `false`.
- Keep generated `debug_capture.png` ignored by git.

