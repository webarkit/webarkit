/*
 *  2026-10-17-r1-paired-cluster-resample.mjs
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
 * The paired cluster resample of round 1's two static baselines by footage
 * second, written on 2026-10-17 as the independent refutation attempt on the
 * window bootstrap (2026-10-17-r1-window-bootstrap.mjs) from the statistical
 * design lens, and kept as the derivation of the paired figure in the plan's
 * note of 2026-10-17 beside M3's runbook step 8. Reads the two exports beside
 * it and the frozen metrics module, and writes nothing.
 *
 *     node docs/benchmarks/2026-10-17-r1-paired-cluster-resample.mjs [resamples] [seed]
 *
 * The window harness is imported from 2026-10-17-r1-window-bootstrap.mjs, not
 * copied: loadRound1, eligibleWindows, construct, pooled, pooledFromSingles,
 * identityCheck and TOL_PX. Its identity check runs here, on both runs, before
 * anything else, and is fatal as there: the eligible-window count of each run
 * on the common set must equal compareExports' jitterWindows, and the identity
 * resample must reproduce compareExports' common-set jitterPx within TOL_PX
 * (1e-12 px; why that value is in the window-bootstrap's header). Every value
 * this script then pools goes through the same `pooled`, fatal unless finite
 * with one window per draw, and every per-second pooled RMS of section B is
 * checked finite. A failed check exits non-zero naming the run, the resample
 * or the second and the values that disagree, and no figure is printed after
 * it.
 *
 * Sections: A, the eligible windows of each run on the pair-common media
 * times and on the full run; B, the per-second structure of the two runs'
 * jitter (pooled RMS by footage second, their correlation across the runs,
 * a one-way ANOVA by second); C, three bootstraps at the given resample count
 * and seed (mulberry32): (1) the independent window bootstrap of each run,
 * replicating the window-bootstrap script, (2) the paired cluster bootstrap,
 * footage seconds drawn with replacement and both runs' windows of each drawn
 * second carried together, (3) the independent window bootstrap on the full
 * runs; D, the serial structure of per-window RMS within a run. The metric is
 * imported and called, never reimplemented; the pooling formula appears only
 * in the per-second description of B and in the harness's check.
 *
 * A known limitation, as the frame-set script's and the stall check's: this
 * script is covered by no test and by no format check (`docs/` is outside
 * both), so a change in a dependency or in the exports' shape could break it
 * without notice while the figures it produced stay in the record; and the
 * tool has no tests, so a defect in it would produce a wrong result
 * reproducibly. Its guards are the imported identity check and the pooled
 * helper's checks, which catch a changed cornerJitter or a broken
 * construction, not a defect of their own. The checks are fatal, so no figure
 * is printed after a failed check.
 */
import {
    TOL_PX,
    construct,
    eligibleWindows,
    fatal,
    identityCheck,
    loadRound1,
    mulberry32,
    pooled,
    pooledFromSingles,
} from "./2026-10-17-r1-window-bootstrap.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = "2026-10-17-r1-paired-cluster-resample.mjs";
const B = Number(process.argv[2] ?? 10000);
const SEED = Number(process.argv[3] ?? 1);
if (!(Number.isInteger(B) && B > 1) || !Number.isInteger(SEED)) {
    fatal(SCRIPT, `usage: node ${SCRIPT} [resamples ≥ 2] [seed]; got ${process.argv.slice(2).join(" ")}`);
}
const { cornerJitter } = await import(pathToFileURL(join(HERE, "../../examples/js/bench-metrics.mjs")).href);
const { base, rep, cmp, inCommon, allPosed } = loadRound1(SCRIPT);
void construct; // the harness's construct is reached through `pooled`
const J = (label, draws) => pooled(SCRIPT, label, draws);
const stats = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const mean = s.reduce((a, v) => a + v, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, v) => a + (v - mean) ** 2, 0) / (s.length - 1));
    const q = (p) => s[Math.round((s.length - 1) * p)];
    return { mean, sd, p025: q(0.025), p975: q(0.975) };
};
const f = (v) => v.toFixed(5);
const finite = (label, v) => {
    if (!Number.isFinite(v)) fatal(SCRIPT, `${label}: ${v} is not a finite number`);
    return v;
};

// ---- phase 1: the harness's identity check, then every figure computed ------
const C = { b: eligibleWindows(base, inCommon), r: eligibleWindows(rep, inCommon) };
const identity = {
    b: identityCheck(SCRIPT, "baseline", C.b, cmp.first),
    r: identityCheck(SCRIPT, "repeat", C.r, cmp.second),
};
const Fw = { b: eligibleWindows(base, allPosed), r: eligibleWindows(rep, allPosed) };

// B. footage-second structure
const bySec = (ws) => {
    const m = new Map();
    for (const w of ws) {
        if (!m.has(w.floor)) m.set(w.floor, []);
        m.get(w.floor).push(w);
    }
    return m;
};
const pooledRms = (ws) =>
    Math.sqrt(ws.reduce((a, w) => a + w.R, 0) / (4 * ws.reduce((a, w) => a + w.dof, 0)));
const sb = bySec(C.b);
const sr = bySec(C.r);
const secs = [...new Set([...sb.keys(), ...sr.keys()])].sort((a, b) => a - b);
const rows = secs.map((s) => ({
    s,
    b: sb.has(s) ? finite(`second ${s}, baseline pooled rms`, pooledRms(sb.get(s))) : null,
    r: sr.has(s) ? finite(`second ${s}, repeat pooled rms`, pooledRms(sr.get(s))) : null,
    nb: sb.get(s)?.length ?? 0,
    nr: sr.get(s)?.length ?? 0,
}));
const both = rows.filter((x) => x.b !== null && x.r !== null);
const corr = (xs, ys) => {
    const mx = xs.reduce((a, v) => a + v, 0) / xs.length;
    const my = ys.reduce((a, v) => a + v, 0) / ys.length;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < xs.length; i++) {
        sxy += (xs[i] - mx) * (ys[i] - my);
        sxx += (xs[i] - mx) ** 2;
        syy += (ys[i] - my) ** 2;
    }
    return sxy / Math.sqrt(sxx * syy);
};
const anova = (() => {
    const all = [...C.b.map((w) => ({ ...w, run: "b" })), ...C.r.map((w) => ({ ...w, run: "r" }))];
    const g = new Map();
    for (const w of all) {
        if (!g.has(w.floor)) g.set(w.floor, []);
        g.get(w.floor).push(w.rms ** 2);
    }
    const grand = all.reduce((a, w) => a + w.rms ** 2, 0) / all.length;
    let ssb = 0;
    let ssw = 0;
    let dfb = 0;
    let dfw = 0;
    for (const vals of g.values()) {
        const m = vals.reduce((a, v) => a + v, 0) / vals.length;
        ssb += vals.length * (m - grand) ** 2;
        for (const v of vals) ssw += (v - m) ** 2;
        dfb++;
        dfw += vals.length - 1;
    }
    dfb--;
    const dups = {};
    for (const [nm, ws] of Object.entries(C)) {
        const g2 = new Map();
        for (const w of ws) {
            if (!g2.has(w.floor)) g2.set(w.floor, []);
            g2.get(w.floor).push(w.rms);
        }
        dups[nm] = [...g2.values()].filter((v) => v.length === 2);
    }
    return { n: all.length, seconds: g.size, F: ssb / dfb / (ssw / dfw), dfb, dfw, eta2: ssb / (ssb + ssw), dups };
})();

// C. bootstraps
const rnd = mulberry32(SEED);
const draw = (ws) => Array.from({ length: ws.length }, () => ws[Math.floor(rnd() * ws.length)]);
const m1 = [];
const m2 = [];
const m3 = [];
const b2 = [];
const r2 = [];
let kb2 = 0;
let kr2 = 0;
for (let t = 0; t < B; t++) {
    m1.push(J(`resample ${t}, (1) repeat`, draw(C.r)) - J(`resample ${t}, (1) baseline`, draw(C.b)));
    const ds = Array.from({ length: secs.length }, () => secs[Math.floor(rnd() * secs.length)]);
    const db = ds.flatMap((s) => sb.get(s) ?? []);
    const dr = ds.flatMap((s) => sr.get(s) ?? []);
    kb2 += db.length;
    kr2 += dr.length;
    const jb = J(`resample ${t}, (2) baseline`, db);
    const jr = J(`resample ${t}, (2) repeat`, dr);
    b2.push(jb);
    r2.push(jr);
    m2.push(jr - jb);
    m3.push(J(`resample ${t}, (3) repeat`, draw(Fw.r)) - J(`resample ${t}, (3) baseline`, draw(Fw.b)));
}
const S1 = stats(m1);
const S2 = stats(m2);
const S3 = stats(m3);
const SB2 = stats(b2);
const SR2 = stats(r2);
const fullB = finite("full run, baseline", cornerJitter(base.frames, {}).jitterPx);
const fullR = finite("full run, repeat", cornerJitter(rep.frames, {}).jitterPx);

// D. serial structure within a run
const spearman = (xs) => {
    const n = xs.length;
    const idx = xs.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const rx = new Array(n);
    idx.forEach(([, i], k) => (rx[i] = k + 1));
    let d2 = 0;
    for (let i = 0; i < n; i++) d2 += (rx[i] - (i + 1)) ** 2;
    return 1 - (6 * d2) / (n * (n * n - 1));
};
const ac1 = (xs) => {
    const m = xs.reduce((a, v) => a + v, 0) / xs.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i++) {
        den += (xs[i] - m) ** 2;
        if (i > 0) num += (xs[i] - m) * (xs[i - 1] - m);
    }
    return num / den;
};

// ---- phase 2: the checks' readings, then the figures ------------------------
console.log(
    `identity check, imported from the window-bootstrap script (TOL_PX ${TOL_PX}): baseline ${identity.b.value} vs compareExports ${identity.b.reference} (diff ${identity.b.diff.toExponential(2)}); repeat ${identity.r.value} vs ${identity.r.reference} (diff ${identity.r.diff.toExponential(2)}); windows ${C.b.length}/${cmp.first.jitterWindows} and ${C.r.length}/${cmp.second.jitterWindows}; every pooled value below finite with one window per draw`,
);
console.log("A. pair-common windows (loop:sec/n/span/rms):");
for (const [nm, ws] of Object.entries(C))
    console.log(
        `  ${nm}: ` +
            ws.map((w) => `${w.key}/${w.n}/${w.span.toFixed(2)}/${w.rms.toFixed(3)}`).join(" "),
    );
console.log(
    `   total dof: b ${C.b.reduce((a, w) => a + w.dof, 0)}, r ${C.r.reduce((a, w) => a + w.dof, 0)}`,
);
console.log("A'. full-run windows (loop:sec/n/rms):");
for (const [nm, ws] of Object.entries(Fw))
    console.log(`  ${nm}: ` + ws.map((w) => `${w.key}/${w.n}/${w.rms.toFixed(3)}`).join(" "));
const keys = (ws) => new Set(ws.map((w) => w.key));
console.log(
    `   keys present in full but not common: b ${
        [...keys(Fw.b)].filter((k) => !keys(C.b).has(k)).join(",") || "none"
    }; r ${[...keys(Fw.r)].filter((k) => !keys(C.r).has(k)).join(",") || "none"}`,
);
console.log("B. per-second pooled rms (sec: baseline[windows] repeat[windows]):");
console.log(
    "  " +
        rows
            .map(
                (x) =>
                    `${x.s}: ${x.b === null ? "-" : x.b.toFixed(3)}[${x.nb}] ${
                        x.r === null ? "-" : x.r.toFixed(3)
                    }[${x.nr}]`,
            )
            .join("  "),
);
console.log(
    `   Pearson r of per-second rms across the two runs over ${both.length} seconds: ${corr(
        both.map((x) => x.b),
        both.map((x) => x.r),
    ).toFixed(3)}`,
);
console.log(
    `   one-way ANOVA of per-window rms^2 by footage second (${anova.n} windows, ${
        anova.seconds
    } seconds): F = ${anova.F.toFixed(2)} on ${anova.dfb} and ${anova.dfw}; eta^2 = ${anova.eta2.toFixed(2)}`,
);
for (const [nm, dup] of Object.entries(anova.dups)) {
    console.log(
        `   ${nm}: seconds with two windows (different loops): ${
            dup.length
        }; |rms difference| between the two loops of a second: ${dup
            .map((v) => Math.abs(v[0] - v[1]).toFixed(3))
            .join(" ")}`,
    );
}
console.log(`C. B = ${B}, seed ${SEED}`);
console.log(
    `  (1) independent window bootstrap, pair-common, ${C.b.length}/${
        C.r.length
    } drawn (replication of the script): movement mean ${f(S1.mean)} sd ${f(S1.sd)} [${f(
        S1.p025,
    )}, ${f(S1.p975)}]`,
);
console.log(
    `  (2) paired cluster bootstrap by footage second (${
        secs.length
    } seconds drawn with replacement; both runs' windows of each drawn second): movement mean ${f(
        S2.mean,
    )} sd ${f(S2.sd)} [${f(S2.p025)}, ${f(S2.p975)}]; per-run sd b ${f(SB2.sd)} r ${f(
        SR2.sd,
    )}; mean windows per resample b ${(kb2 / B).toFixed(1)} r ${(kr2 / B).toFixed(
        1,
    )}; implied corr(b,r) = ${(
        (SB2.sd ** 2 + SR2.sd ** 2 - S2.sd ** 2) /
        (2 * SB2.sd * SR2.sd)
    ).toFixed(3)}`,
);
console.log(
    `  (3) independent window bootstrap on FULL-RUN windows (300 frames each, ${Fw.b.length}/${
        Fw.r.length
    } windows): observed full-run movement ${f(fullR - fullB)} (${f(fullB)} -> ${f(
        fullR,
    )}); bootstrap movement mean ${f(S3.mean)} sd ${f(S3.sd)} [${f(S3.p025)}, ${f(S3.p975)}]`,
);
console.log(
    `  small-K bootstrap bias factor sqrt((K-1)/K): K=20 ${Math.sqrt(19 / 20).toFixed(
        4,
    )}, K=18 ${Math.sqrt(17 / 18).toFixed(4)}`,
);
console.log(
    `D. Spearman rho of per-window rms vs processed order: baseline ${spearman(
        C.b.map((w) => w.rms),
    ).toFixed(3)} (n=${C.b.length}), repeat ${spearman(C.r.map((w) => w.rms)).toFixed(3)} (n=${
        C.r.length
    })`,
);
console.log(
    `   lag-1 autocorrelation of per-window rms: baseline ${ac1(C.b.map((w) => w.rms)).toFixed(
        3,
    )}, repeat ${ac1(C.r.map((w) => w.rms)).toFixed(3)}`,
);
void pooledFromSingles; // the harness's check 3 and 4 run in the window-bootstrap script itself
