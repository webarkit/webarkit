/*
 *  index.ts
 *  nft-tracker
 *
 *  This file is part of nft-tracker - WebARKit.
 *
 *  SPDX-License-Identifier: LGPL-3.0-or-later
 *
 *  nft-tracker is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Lesser General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  nft-tracker is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License
 *  along with nft-tracker.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  As a special exception, the copyright holders of this library give you
 *  permission to link this library with independent modules to produce an
 *  executable, regardless of the license terms of these independent modules, and to
 *  copy and distribute the resulting executable under terms of your choice,
 *  provided that you also meet, for each linked independent module, the terms and
 *  conditions of the license of that module. An independent module is a module
 *  which is neither derived from nor based on this library. If you modify this
 *  library, you may extend this exception to your version of the library, but you
 *  are not obligated to do so. If you do not wish to do so, delete this exception
 *  statement from your version.
 *
 *  Copyright 2026 WebARKit.
 *
 *  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
 *             Thorsten Bux @ThorstenBux https://github.com/ThorstenBux
 *
 */

export {
    buildLevelIndex,
    chooseDescriptorSet,
    DEFAULT_MAX_SCENE_KEYPOINTS,
    DEFAULT_RANSAC_THRESHOLD,
    DEFAULT_RATIO,
    DEFAULT_SCENE_LEVELS,
    detectTarget,
    matchPerLevel,
    MIN_DETECTION_INLIERS,
    prepareDetection,
} from "./detection.js";
export type {
    Detection,
    DetectionFailure,
    DetectionSetup,
    DetectTargetOptions,
    TargetLevelView,
    UsableDescriptorSet,
} from "./detection.js";

export {
    buildTargetFromImage,
    DEFAULT_KEYPOINTS_PER_LEVEL,
    DEFAULT_SCALE_STEP,
    DEFAULT_TARGET_LEVELS,
} from "./target/build_from_image.js";
export type { BuildTargetOptions } from "./target/build_from_image.js";

export {
    DEFAULT_ALIGN_EPSILON,
    DEFAULT_ALIGN_MAX_ITERATIONS,
    DEFAULT_FIT_EPSILON,
    DEFAULT_FIT_MAX_ITERATIONS,
    DEFAULT_MAX_FIT_RMS,
    DEFAULT_MAX_FRAME_LEVELS,
    DEFAULT_MAX_OUTLIER_SHARE,
    DEFAULT_MIN_PATCH_ZNCC,
    DEFAULT_MIN_TRACKED_PATCHES,
    DEFAULT_PHOTOMETRIC,
    DEFAULT_TUKEY_C,
    NftTracker,
} from "./tracker.js";
export type { NftTrackerOptions, TrackFailure, TrackResult, TrackTimings } from "./tracker.js";
export type { TrackLoss, TrackStats } from "./tracking/track_frame.js";

// The pose above the contract (M4's step 3, #105): IPPE's two candidates, the
// selection rule, and the tracker-local closed form it falls back to.
export { ippe } from "./pose/ippe.js";
export type { IppeFailure, IppeResult, PoseCandidate } from "./pose/ippe.js";
export {
    ambiguityMargin,
    inFront,
    POSE_AMBIGUITY_SIGMA_TRACK_PX,
    selectPose,
    targetGrid,
} from "./pose/select_pose.js";
export type { PoseSelection, PoseSelectionOutcome } from "./pose/select_pose.js";
export { closedFormPose } from "./pose/closed_form.js";

// The conditioning signal on the fit, before the pose step (M4's step 2,
// #104): the two quantities, the refusing state's rule, and the tracker's
// option for its three states, off by default.
export { conditioning, conditioningRefuses } from "./pose/conditioning.js";
export type { ConditioningReading, ConditioningThresholds } from "./pose/conditioning.js";
export { DEFAULT_CONDITIONING } from "./tracker.js";
export type { ConditioningMode, ConditioningOptions } from "./tracker.js";

// One Euro filtering of the pose, the rotation in its tangent space (#106,
// M5): the tracker's option, off by default, and the registered derived
// values its "one-euro" mode takes for an omitted parameter. The filter's
// module itself is not exported here (the Stage 3 registration, ruling C).
export {
    DEFAULT_POSE_FILTER,
    DEFAULT_POSE_FILTER_D_CUTOFF,
    DEFAULT_POSE_FILTER_ROTATION_BETA,
    DEFAULT_POSE_FILTER_ROTATION_MIN_CUTOFF,
    DEFAULT_POSE_FILTER_TRANSLATION_BETA,
    DEFAULT_POSE_FILTER_TRANSLATION_MIN_CUTOFF,
} from "./tracker.js";
export type { PoseFilterLayerOptions, PoseFilterOptions } from "./tracker.js";

// The tracking state (M2). Every function is exported here up front, stub or
// not, so the branches implementing them never need to touch this file.
export { levelScale } from "./tracking/level_scale.js";
export { selectPatches } from "./tracking/select_patches.js";
export { buildFramePyramid } from "./tracking/frame_pyramid.js";
export { alignPatch } from "./tracking/align_patch.js";
export { robustHomography } from "./tracking/robust_homography.js";
export { predictHomography } from "./tracking/predict_homography.js";
export type {
    AlignPatch,
    AlignPatchOptions,
    BuildFramePyramid,
    DetectionUse,
    FramePyramid,
    FramePyramidFailure,
    FramePyramidOptions,
    FramePyramidResult,
    HomographyPrediction,
    HomographyPredictionFailure,
    ImagePyramid,
    PatchAlignment,
    PatchAlignmentFailure,
    PatchObservation,
    PatchSelection,
    PatchSelectionFailure,
    PredictHomography,
    RobustHomography,
    RobustHomographyFailure,
    RobustHomographyOptions,
    RobustHomographyResult,
    SelectPatches,
    SelectPatchesOptions,
    TrackingState,
} from "./tracking/types.js";

export { DEFAULT_LIMITS, decode, encode } from "./target/format/index.js";
export type {
    DecodeLimits,
    DecodeOptions,
    DecodeResult,
    EncodeResult,
    ErrorCode,
    Warning,
    WarningCode,
} from "./target/format/index.js";

export type {
    BitsDescriptorSet,
    DescriptorSet,
    DetectorInfo,
    F32DescriptorSet,
    JsonValue,
    KeypointTable,
    Params,
    PatchTable,
    PyramidInfo,
    ReferenceImage,
    TargetDb,
    TargetInfo,
    TargetMeta,
    U8DescriptorSet,
} from "./target/types.js";
