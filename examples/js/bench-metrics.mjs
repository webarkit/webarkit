/*
 *  bench-metrics.mjs
 *  webarkit
 *
 *  This file is part of webarkit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *
 */

/**
 * The bench's logic, apart from its page: every run metric `bench-nft.html`
 * reports and the one text defining each, the page's URL parameters, and the
 * helpers its pyramid probe and the desktop replay share. The page, the
 * comparison script (`scripts/compare-bench.mjs`) and the replay
 * (`scripts/replay-clips.mjs`) all import this module, so two exports — or an
 * export and a replay — cannot mean different things by one name. Pure: no
 * DOM, and no clock of its own. Tested in `examples/test/`.
 *
 * Split by concern (#98) into the `bench-*.mjs` modules beside it, which this
 * one re-exports under the names it has always exported, so that every
 * importer reads them from this one entry point.
 */

export { percentile, stats } from "./bench-stats.mjs";
export {
    targetCorners,
    reprojectCorners,
    frameRecord,
    framesForStage,
    stageSamples,
    stageSummary,
} from "./bench-frames.mjs";
export {
    DETECTION_STAGES,
    METRICS_VERSION,
    LOW_QUALITY,
    JITTER_WINDOW_S,
    TRACK_TIME_BIN_MS,
    DEFINITIONS,
} from "./bench-definitions.mjs";
export {
    isLoopWrap,
    countLoopWraps,
    unwrapMediaTimes,
    countedLoopFrames,
    mediaKey,
} from "./bench-loops.mjs";
export { reacquisitions, lockSteps, trackTimeShare, detectionLocks } from "./bench-locks.mjs";
export {
    firstStepLatency,
    detectionOutcomes,
    trackFramesWithDetectionInFlight,
    frameMs,
    unlockedResidualMs,
    postToArrivalSamples,
    detectionTime,
} from "./bench-detection.mjs";
export { cornerJitter, summarizeRun, compareExports } from "./bench-summary.mjs";
export {
    MODES,
    DETECTION_PATHS,
    parsePositiveInt,
    parseRunParams,
    TUNABLE_TRACKER_OPTIONS,
    parseTrackerOverrides,
    DEFAULT_TARGET_FILE,
    trackabilityError,
    startRefusal,
} from "./bench-params.mjs";
export {
    ACCOUNTING_COUNTS,
    accountingError,
    exportDetectionPath,
    SESSION_LOOPS,
    sessionRunGaps,
    trackerDefaults,
    PAGE_PROCESSING_BOX,
    sessionDefaults,
    transferPlan,
} from "./bench-export-checks.mjs";
export {
    provenanceFindings,
    bundleManifestRefusal,
    provenanceRefusal,
} from "./bench-provenance.mjs";
export {
    sequenceRefusal,
    sequenceSettings,
    proxyRatio,
    clockResolution,
    timeRepeated,
    texturedFrame,
    sha256Hex,
    targetRecord,
    nextFrameIndex,
    framesAt,
} from "./bench-probe-replay.mjs";
