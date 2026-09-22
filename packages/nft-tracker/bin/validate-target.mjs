/*
 *  validate-target.mjs
 *  @webarkit/nft-tracker
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
 * Validate a `.wnft` target, and say whether a backend can actually use it.
 *
 * Two questions, and they are not the same one:
 *
 * 1. **Is the file valid?** `decode` answers that, against
 *    `docs/specs/nft-target-format.md` — an error code from §6.2, plus any
 *    warnings from the same table.
 * 2. **Can this backend use it?** §6.3 answers that, by selecting a descriptor
 *    set against a runtime backend's `capabilities`. A perfectly valid file can
 *    be unusable: `NO_USABLE_DESCRIPTORS` is an outcome of *selection*, not of
 *    decoding, which is why §8.1 exempts it from "one fixture per error code".
 *    Decoding alone cannot tell you a target will not track.
 *
 * The second pass is what makes this worth having over `decode` in a REPL, and
 * it is why this lives in `bin/` and not in `src/`: it imports a backend, which
 * ADR-0001 point 2 forbids `src/` from doing. `bin/` is not `src/`, and
 * `cv-backend-jsfeatnext` is already a devDependency.
 *
 * **It reuses `chooseDescriptorSet` rather than reimplementing §6.3.** A
 * validator with its own copy of the selection rule would be a third
 * implementation of it, free to drift from the two that matter, and would
 * report on itself rather than on the tracker.
 *
 * **And it runs §6.3's width probe.** `chooseDescriptorSet` deliberately does
 * not: it checks `elementType`, `norm` and `kind`, and leaves the probe to the
 * codec. But two backends can declare the same `kind` and still produce
 * descriptors of a different size, and `match` cannot compare rows of
 * different widths — so a tool that said "usable" on the three declared checks
 * alone would be overclaiming the one thing a user came to it for.
 */

import { readFileSync } from "node:fs";
import process from "node:process";

import { createJsfeatNextBackend } from "@webarkit/cv-backend-jsfeatnext";

import { chooseDescriptorSet, decode } from "../dist/index.js";

const USAGE = `usage: validate-target <file.wnft> [more.wnft ...] [options]

      --decode-only   only check the file against the specification; skip the
                      §6.3 usability pass, and load no backend
      --json          machine-readable output
  -h, --help          this text

exit: 0 every file valid (and usable, unless --decode-only), 1 otherwise,
      2 bad usage
`;

const EXIT_USAGE = 2;

function parseArgs(argv) {
    const files = [];
    let decodeOnly = false;
    let json = false;

    for (const arg of argv) {
        if (arg === "-h" || arg === "--help") return { help: true };
        else if (arg === "--decode-only") decodeOnly = true;
        else if (arg === "--json") json = true;
        else if (arg.startsWith("-")) throw new Error(`unknown option: ${arg}`);
        else files.push(arg);
    }
    if (files.length === 0) throw new Error("no input file");
    return { files, decodeOnly, json };
}

/**
 * §6.3's descriptor-width probe, on a synthetic image.
 *
 * The image's content does not matter — only the shape of what `describe`
 * returns does — but it is deliberately not flat: a backend is entitled to
 * reject a keypoint in a featureless region, and a uniform buffer would make
 * an inconclusive probe look like a failed one. The keypoint sits at the
 * centre so no descriptor patch runs past an edge.
 *
 * `bits` is the set's own `dimensions`, as §6.3 requires: without it a 512-bit
 * set would be rejected merely because the backend's default for that family
 * is 256.
 */
function probeWidth(cv, set) {
    const side = 64;
    const data = new Uint8Array(side * side);
    for (let i = 0; i < data.length; i += 1) {
        data[i] = (i * 37 + (i % side) * 11) & 0xff;
    }
    const keypoints = [
        { x: side / 2, y: side / 2, score: 1, angle: 0, level: 0 },
    ];
    try {
        const d = cv.describe({ data, width: side, height: side }, keypoints, {
            kind: set.kind,
            bits: set.dimensions,
        });
        if (typeof d?.bytesPerDescriptor !== "number") {
            return { ran: false, reason: "the backend returned no descriptor shape" };
        }
        return {
            ran: true,
            ok: d.bytesPerDescriptor === set.bytesPerDescriptor && d.norm === set.norm,
            bytesPerDescriptor: d.bytesPerDescriptor,
            norm: d.norm,
        };
    } catch (error) {
        // An inconclusive probe is reported as inconclusive. Treating it as a
        // pass would reintroduce exactly the overclaim this function exists to
        // prevent.
        return { ran: false, reason: error instanceof Error ? error.message : String(error) };
    }
}

function summarise(target) {
    const { meta, pyramid, keypoints, descriptorSets, patches, referenceImage } = target;
    return {
        formatVersion: target.formatVersion,
        generator: target.generator ?? null,
        widthPx: meta.widthPx,
        heightPx: meta.heightPx,
        physicalSizeMm: meta.physicalSizeMm ?? null,
        scaleStep: pyramid.scaleStep,
        levels: pyramid.levelSizes.length,
        keypoints: keypoints.count,
        descriptorSets: descriptorSets.map((s) => ({
            kind: s.kind,
            norm: s.norm,
            elementType: s.elementType,
            dimensions: s.dimensions,
            bytesPerDescriptor: s.bytesPerDescriptor,
            producer: s.producer,
            count: s.count,
        })),
        patches: patches === undefined ? 0 : patches.count,
        referenceImage: referenceImage !== undefined,
    };
}

function checkOne(bytes, cv) {
    const r = decode(bytes);
    if (!r.ok) {
        return { valid: false, error: r.error, detail: r.detail ?? null };
    }

    const result = {
        valid: true,
        warnings: r.warnings.map((w) => ({ code: w.code, detail: w.detail ?? null })),
        target: summarise(r.target),
    };
    if (cv === null) return result;

    try {
        const set = chooseDescriptorSet(cv, r.target);
        const probe = probeWidth(cv, set);
        result.usable = {
            // Usable only when the probe agrees, or could not be run. An
            // outright width or norm mismatch is a "no": `match` cannot
            // compare rows of different widths.
            ok: probe.ran ? probe.ok : true,
            backend: cv.capabilities.name,
            chosen: `${set.kind}/${set.norm}/${set.dimensions}`,
            producer: set.producer,
            // §6.2's PRODUCER_MISMATCH: the chosen set was computed by a
            // different backend than the one reading it. A **warning**, not a
            // failure, and deliberately not folded into `ok` — §6.3 keeps it
            // one until cross-backend descriptor conformance is established
            // (ADR-0001, contract gaps). The probe above checks descriptor
            // *shape*; two backends can agree on shape and still compute
            // different bits, and this is the only signal a user gets that
            // they might.
            producerMismatch: set.producer !== cv.capabilities.name,
            probe,
        };
    } catch (error) {
        result.usable = {
            ok: false,
            backend: cv.capabilities.name,
            chosen: null,
            reason: error instanceof Error ? error.message : String(error),
        };
    }
    return result;
}

function printHuman(file, r) {
    console.log(file);
    if (!r.valid) {
        console.log(`  decode      FAILED  ${r.error}`);
        if (r.detail !== null) console.log(`              ${r.detail}`);
        return;
    }
    const t = r.target;
    const size =
        t.physicalSizeMm === null
            ? "physical size unknown (units are level-0 pixels)"
            : `${t.physicalSizeMm[0]} x ${t.physicalSizeMm[1]} mm`;
    console.log(`  decode      ok, format ${t.formatVersion}`);
    console.log(
        `  target      ${t.widthPx}x${t.heightPx}, ${t.levels} level${t.levels === 1 ? "" : "s"}, ` +
            `${t.keypoints} keypoint${t.keypoints === 1 ? "" : "s"}, ${t.patches} patch${t.patches === 1 ? "" : "es"}` +
            `${t.referenceImage ? ", reference image" : ""}`,
    );
    console.log(`  physical    ${size}`);
    for (const s of t.descriptorSets) {
        console.log(
            `  set         ${s.kind}/${s.norm}/${s.elementType}/${s.dimensions} by ` +
                `${s.producer}, ${s.count} row${s.count === 1 ? "" : "s"}, ${s.bytesPerDescriptor} B each`,
        );
    }
    for (const w of r.warnings) {
        console.log(`  warning     ${w.code}${w.detail === null ? "" : `  ${w.detail}`}`);
    }
    if (r.usable === undefined) return;

    if (!r.usable.ok && r.usable.chosen === null) {
        console.log(`  usable      NO, on backend '${r.usable.backend}'`);
        console.log(`              ${r.usable.reason}`);
        return;
    }
    const p = r.usable.probe;
    const probeText = p.ran
        ? `probe: ${p.bytesPerDescriptor} B/descriptor, ${p.norm}`
        : `probe not conclusive: ${p.reason}`;
    console.log(
        `  usable      ${r.usable.ok ? "yes" : "NO"} on '${r.usable.backend}' via ${r.usable.chosen} (${probeText})`,
    );
    if (r.usable.producerMismatch) {
        console.log(
            `  warning     PRODUCER_MISMATCH  the chosen set was produced by '${r.usable.producer}', ` +
                `not by '${r.usable.backend}'. Descriptor shape matches; the bits may still differ.`,
        );
    }
}

async function main(argv) {
    const args = parseArgs(argv);
    if (args.help === true) {
        console.log(USAGE);
        return 0;
    }

    const cv = args.decodeOnly ? null : await createJsfeatNextBackend();

    const results = [];
    let bad = 0;
    for (const file of args.files) {
        let r;
        try {
            r = checkOne(new Uint8Array(readFileSync(file)), cv);
        } catch (error) {
            r = {
                valid: false,
                error: "UNREADABLE",
                detail: error instanceof Error ? error.message : String(error),
            };
        }
        if (!r.valid || (r.usable !== undefined && !r.usable.ok)) bad += 1;
        results.push({ file, ...r });
        if (!args.json) {
            printHuman(file, r);
            if (args.files.length > 1) console.log("");
        }
    }

    if (args.json) console.log(JSON.stringify(results, null, 2));
    return bad === 0 ? 0 : 1;
}

main(process.argv.slice(2))
    .then((code) => {
        process.exitCode = code;
    })
    .catch((error) => {
        console.error(`validate-target: ${error instanceof Error ? error.message : error}`);
        console.error(`\n${USAGE}`);
        process.exitCode = EXIT_USAGE;
    });
