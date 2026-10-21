/*
 *  conditioning_fixture.ts
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

// Sixteen fitted homographies of #90's sweep, chosen for what they would
// catch in the conditioning signal's arithmetic, each with the figures the
// derivation of record (docs/benchmarks/2026-10-21-104-stage1-threshold-
// derivation.md, #160) prints for it. conditioning.test.ts reads them in
// milliseconds; conditioning_sweep.test.ts, which runs the sweep, asserts
// that each H here is the fit the sweep produces, entry for entry, so that
// this file cannot drift from the sweep unnoticed.
//
// The composition:
// - the eight gross wrong fits of M2's 64 patches, the acceptance's
//   must-fire set, with #160's per-fit error, d_scale and d_orth;
// - the six fits that set the floors #160 derives — the largest |d_scale|
//   and |d_orth| over the right fits pooled, on view 0, and on the shipped
//   target alone — where the must-not-fire side binds;
// - two of the sixteen non-gross wrong fits with the thinnest margins in
//   #160, where a small arithmetic error would be invisible on the easy
//   cases and visible here.
// The two exact views (the fatal anchor and the similarity) are built by
// conditioning.test.ts from the frozen fixture's view(), not stored here.
//
// Captured from the sweep test's own run on 2026-10-21, at dev 4ee2679, with
// the tracker's defaults; each H is the fit's, to the last bit (JSON-encoded
// doubles round-trip exactly). Never hand-edit an H: to regenerate, add a
// temporary block to conditioning_sweep.test.ts that writes `fits` for these
// sixteen ids (`JSON.stringify(Array.from(f.H))`), run it once, paste, and
// remove the block; the sweep test's last describe then checks every entry.
// Nothing here is a claim about the sweep's population: sixteen cases of
// 1,599 fits, chosen, not sampled.

export interface ConditioningCase {
    /** `target/seed/view/prediction`. */
    readonly id: string;
    readonly target: "shipped" | "m2";
    readonly seed: number;
    readonly view: 0 | 1;
    /** As #160's tables label it. */
    readonly prediction: string;
    /** Why this fit is in the fixture. */
    readonly role: string;
    /** The sweep's verdict and the record's description. */
    readonly right: boolean;
    readonly gross: boolean;
    /** The fitted homography, target level-0 → frame, row-major. */
    readonly H: readonly number[];
    /** #160's figures for this fit, as printed (U+2212 for minus), each optional. */
    readonly figures: {
        readonly error?: string;
        readonly dScale?: string;
        readonly dOrth?: string;
        readonly absDScale?: string;
        readonly absDOrth?: string;
        readonly inliers?: number;
    };
}

export const CONDITIONING_FIXTURE: readonly ConditioningCase[] = [
    {
        id: "m2/1/0/scale x1.1",
        target: "m2",
        seed: 1,
        view: 0,
        prediction: "scale x1.1",
        role: "gross wrong fit, 7.274 px off: the must-fire set",
        right: false,
        gross: true,
        H: [
            0.5858469082430919, 0.022896836781525143, -0.3027362142078103, 0.07319797003606066,
            0.5769826960893407, 5.188383083771424, 0.00038180501576321623, 0.000196106850758824, 1,
        ],
        figures: { error: "7.274", dScale: "−0.003502", dOrth: "+0.01564", inliers: 10 },
    },
    {
        id: "m2/1/1/scale x1.1",
        target: "m2",
        seed: 1,
        view: 1,
        prediction: "scale x1.1",
        role: "gross wrong fit, 7.888 px off: the must-fire set",
        right: false,
        gross: true,
        H: [
            0.6270745530371881, -0.1638181219039469, 48.57387093601355, 0.29333783099991156,
            0.4928483385831429, -24.237096590301825, 0.0008356189740907823, -0.00016767313187221312,
            1,
        ],
        figures: { error: "7.888", dScale: "+0.04645", dOrth: "−0.01785", inliers: 9 },
    },
    {
        id: "m2/2/0/scale x1.1",
        target: "m2",
        seed: 2,
        view: 0,
        prediction: "scale x1.1",
        role: "gross wrong fit, 7.108 px off: the must-fire set",
        right: false,
        gross: true,
        H: [
            0.5793110051394861, 0.0260525128985277, -1.0404201190600235, 0.0680900952232353,
            0.5737639711020747, 6.024298106950795, 0.00034847859054405164, 0.00019711538586255034,
            1,
        ],
        figures: { error: "7.108", dScale: "−0.003256", dOrth: "+0.02181", inliers: 10 },
    },
    {
        id: "m2/2/1/scale x1.1",
        target: "m2",
        seed: 2,
        view: 1,
        prediction: "scale x1.1",
        role: "gross wrong fit, 9.400 px off: the must-fire set",
        right: false,
        gross: true,
        H: [
            0.6442951956087701, -0.11951547567898584, 38.834840242680805, 0.2885470851814423,
            0.5762566329604049, -37.24061774060308, 0.0007521913461080644, 0.00011317444752690704,
            1,
        ],
        figures: { error: "9.400", dScale: "+0.03166", dOrth: "+0.04916", inliers: 8 },
    },
    {
        id: "m2/3/0/scale x1.1",
        target: "m2",
        seed: 3,
        view: 0,
        prediction: "scale x1.1",
        role: "gross wrong fit, 9.193 px off: the must-fire set",
        right: false,
        gross: true,
        H: [
            0.5947185631278377, 0.07968009735163153, -13.299757750094466, 0.05240150995977327,
            0.6549984409272036, -3.571524066630324, 0.00025171393211776284, 0.00048649273284254635,
            1,
        ],
        figures: { error: "9.193", dScale: "−0.02596", dOrth: "+0.05690", inliers: 8 },
    },
    {
        id: "m2/3/1/scale x1.1",
        target: "m2",
        seed: 3,
        view: 1,
        prediction: "scale x1.1",
        role: "gross wrong fit, 7.686 px off: the must-fire set",
        right: false,
        gross: true,
        H: [
            0.6228672572955696, -0.1620115083951416, 48.39451835969382, 0.28956322068361856,
            0.49276908401699376, -23.958575424442483, 0.0008119386309751327,
            -0.00016221260038694628, 1,
        ],
        figures: { error: "7.686", dScale: "+0.04420", dOrth: "−0.01389", inliers: 10 },
    },
    {
        id: "m2/4/1/scale x1.1",
        target: "m2",
        seed: 4,
        view: 1,
        prediction: "scale x1.1",
        role: "gross wrong fit, 9.363 px off: the must-fire set",
        right: false,
        gross: true,
        H: [
            0.6453427136991954, -0.12056749925384232, 38.94170075839016, 0.2899378831705901,
            0.575773880068698, -37.42830387668428, 0.0007595925473475433, 0.00010749378670411664, 1,
        ],
        figures: { error: "9.363", dScale: "+0.03171", dOrth: "+0.04837", inliers: 8 },
    },
    {
        id: "m2/4/1/scale x1.12",
        target: "m2",
        seed: 4,
        view: 1,
        prediction: "scale x1.12",
        role: "gross wrong fit, 8.148 px off: the must-fire set",
        right: false,
        gross: true,
        H: [
            0.6296586642153054, -0.1622516925783824, 47.84598733242992, 0.2925601078668594,
            0.5030301641723791, -26.44093675180276, 0.0008234493614318645, -0.00014260017979192998,
            1,
        ],
        figures: { error: "8.148", dScale: "+0.04174", dOrth: "−0.01356", inliers: 8 },
    },
    {
        id: "m2/2/1/roll +3°",
        target: "m2",
        seed: 2,
        view: 1,
        prediction: "roll +3°",
        role: "the pooled and view-1 τ_o floor: the largest |d_orth|, and the largest E, of any right fit",
        right: true,
        gross: false,
        H: [
            0.49147122189715936, -0.15850324214950445, 60.44041452077954, 0.18933751304837587,
            0.3825538123054485, 10.046213698950044, 0.00040143692733553423, -0.00030272989044623526,
            1,
        ],
        figures: { absDOrth: "0.03265", inliers: 23 },
    },
    {
        id: "m2/4/1/shift 3 px @ 112.5°",
        target: "m2",
        seed: 4,
        view: 1,
        prediction: "shift 3 px @ 112.5°",
        role: "the pooled and view-1 τ_s floor: the largest |d_scale| of any right fit",
        right: true,
        gross: false,
        H: [
            0.4918825313757872, -0.15808289280464025, 60.255678867344045, 0.18966748603902642,
            0.3829529244455219, 9.902474607554447, 0.00040262185967656776, -0.00030175600138278123,
            1,
        ],
        figures: { absDScale: "0.009661" },
    },
    {
        id: "m2/3/0/scale x1.08",
        target: "m2",
        seed: 3,
        view: 0,
        prediction: "scale x1.08",
        role: "view 0's τ_o floor: the largest |d_orth|, and the largest E, of a right fit on view 0",
        right: true,
        gross: false,
        H: [
            0.45338627683763916, 0.0009383368806882157, 19.059778792505053, 0.0030344758873103107,
            0.45515028428341625, 34.20382836821922, 0.000006923627434175344,
            0.000008434938357514618, 1,
        ],
        figures: { absDOrth: "0.003526", inliers: 13 },
    },
    {
        id: "m2/4/0/roll -3°",
        target: "m2",
        seed: 4,
        view: 0,
        prediction: "roll -3°",
        role: "view 0's τ_s floor: the largest |d_scale| of a right fit on view 0",
        right: true,
        gross: false,
        H: [
            0.44825921403476626, -0.0002949331671770167, 19.68728923686934, -0.0015132248020550616,
            0.4483432254780313, 36.152690353835744, -0.000010506609377971087, -9.138689813046279e-7,
            1,
        ],
        figures: { absDScale: "0.002624" },
    },
    {
        id: "shipped/5/1/shift 4 px @ 247.5°",
        target: "shipped",
        seed: 5,
        view: 1,
        prediction: "shift 4 px @ 247.5°",
        role: "the shipped target's τ_o floor: its right fits' largest |d_orth|",
        right: true,
        gross: false,
        H: [
            0.4904676750583613, -0.1577309193493509, 60.299053058787855, 0.1883159746308371,
            0.3829695517248391, 9.983099552784607, 0.0003981028688982217, -0.00030140461746662174,
            1,
        ],
        figures: { absDOrth: "0.03155", inliers: 20 },
    },
    {
        id: "shipped/4/1/roll +4°",
        target: "shipped",
        seed: 4,
        view: 1,
        prediction: "roll +4°",
        role: "the shipped target's τ_s floor: its right fits' largest |d_scale|",
        right: true,
        gross: false,
        H: [
            0.4923523401503742, -0.1568401234882108, 59.86009365700935, 0.18912273905264598,
            0.38646816220251773, 9.368368252600392, 0.0003965411025868819, -0.00029134775717772044,
            1,
        ],
        figures: { absDScale: "0.009270" },
    },
    {
        id: "m2/1/0/scale x1.08",
        target: "m2",
        seed: 1,
        view: 0,
        prediction: "scale x1.08",
        role: "of the sixteen: the smallest E on view 0, 0.000121 above view 0's floor — the thinnest margin in #160",
        right: false,
        gross: false,
        H: [
            0.4569547507458482, 0.0013330605455449285, 18.307153155875923, 0.004337384058598259,
            0.4565425598139748, 33.889860675433525, 0.000014403075532060125, 0.00001064152279825439,
            1,
        ],
        figures: { error: "0.522", dScale: "+0.0008628", dOrth: "+0.003647", inliers: 13 },
    },
    {
        id: "m2/3/1/roll -4°",
        target: "m2",
        seed: 3,
        view: 1,
        prediction: "roll -4°",
        role: "of the sixteen: refused at the pooled floor pair by d_scale alone, by 0.000302 — the smallest excess over the pooled floor pair among the sixteen (#160, 'The sixteen')",
        right: false,
        gross: false,
        H: [
            0.48649689857060446, -0.15720781914493767, 60.241513768702916, 0.18547629471486585,
            0.3798040772948256, 10.63522882744281, 0.0003753461187154383, -0.0003042399341365239, 1,
        ],
        figures: { error: "0.571", dScale: "+0.009963", dOrth: "−0.02682", inliers: 12 },
    },
];
