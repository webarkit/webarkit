/*
 *  bench-provenance.mjs
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
 * The provenance check: what Start found wrong against the build's manifest
 * (#110), and why the replay's `--packages bundle` cannot run on one.
 *
 * Split out of `bench-metrics.mjs` by concern (#98). Import from there: it
 * re-exports every name here, under the same name.
 */

/** A full commit hash, as `git rev-parse HEAD` prints it: SHA-1's 40 hex digits, or SHA-256's 64. */
const FULL_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/**
 * Why a git build's manifest cannot be what `scripts/build-provenance.mjs`
 * wrote, as a clause whose subject is `subject`, or `null` (#119): a `head`
 * that is not a full commit hash, a `clean` that is not a boolean, a
 * `dirtyPaths` that is not a list, whatever `clean` says, or a `clean` that
 * disagrees with `dirtyPaths` (`clean: true` beside a non-empty list,
 * `clean: false` beside an empty one). A git build always writes a boolean and
 * a list, so such a manifest was hand-edited or written by a broken build, and
 * neither flag can be read. Read only after `head` null: the build without git
 * writes `clean: false` beside an empty `dirtyPaths`, which is not a
 * disagreement here but its own finding.
 */
function manifestFlagsError(manifest, subject) {
    const { head, clean, dirtyPaths } = manifest;
    if (typeof head !== "string" || !FULL_COMMIT.test(head))
        return `${subject}'s head ${JSON.stringify(head)} is not a full commit hash`;
    if (clean === undefined) return `${subject} records no clean flag`;
    if (typeof clean !== "boolean")
        return `${subject}'s clean flag ${shown(clean)} is not a boolean`;
    if (dirtyPaths === undefined) return `${subject} records no dirtyPaths list`;
    if (!Array.isArray(dirtyPaths))
        return `${subject}'s dirtyPaths ${shown(dirtyPaths)} is not a list`;
    if (clean === true && dirtyPaths.length > 0)
        return `${subject} says its tree is clean, but lists dirty paths (${dirtyPaths.join(", ")})`;
    if (clean === false && dirtyPaths.length === 0)
        return `${subject} says its tree is dirty, but lists no dirty path`;
    return null;
}

/** A manifest's value as a refusal quotes it: as JSON, or as JavaScript prints it when JSON cannot. */
const shown = (v) => JSON.stringify(v) ?? String(v);

/** The end of every refusal {@link manifestFlagsError} gives a reason for. */
const BROKEN_MANIFEST = "so it was hand-edited or written by a broken build";

/**
 * What the provenance check found wrong, in one line with its remedies, or
 * `null` (#110, §5). `manifest` is `examples/dist/provenance.json` as fetched
 * at Start (`null` when it could not be read); `observed` is what the page saw
 * then: `manifestChanged` (its bytes differ from the copy fetched at page
 * load), `bundleSha256` and `served` (`{ path: sha256 }`: the bytes the server
 * served at Start, not necessarily those the page loaded), `loaded` (the
 * repository paths of the modules in the page's resource timeline, where
 * Chrome records the worker's imports too), `unfetched` (the page and the
 * listed modules whose body did not cross the network: a hit, `transferSize`
 * 0 or absent, or a 304, which can be validated by date and proves nothing
 * about the bytes — #110, A5, correcting "a 304 passes"; so what
 * ran is unknown), `timelineFull` (the resource-timing buffer overflowed,
 * so later loads went unrecorded) and `cacheControl` (`{ path: header }`, the
 * `Cache-Control` of each response the check fetched).
 *
 * A check that cannot tell "clean" from "blind" must refuse when it is blind:
 * a module the run loads (the bundle, the page's modules, and in a worker run
 * the worker's) missing from `loaded`, a module from the cache, and a full
 * timeline are each a finding (#110, A1, A5).
 * So is a response without `no-store`: that one removes the cause, while the
 * cached-module finding is still needed because a cache can predate the
 * server's current headers.
 * Each finding names its own remedy: a refusal whose remedy does not apply
 * teaches people to ignore refusals.
 */
export function provenanceFindings(manifest, observed, { detection = "sync" } = {}) {
    // Without a manifest there is nothing to compare; every other finding is
    // independent of the rest, and each is named with its remedy.
    if (!manifest)
        return "Provenance: no manifest (examples/dist/provenance.json). To fix: run `npm run build`.";
    const found = [];
    const add = (reason, remedy) => found.push({ reason, remedy });
    if (observed.manifestChanged)
        add("the manifest changed since the page loaded", "reload the page");
    const rebuild = "commit, run `npm run build`, and reload";
    const flagsError = manifest.head == null ? null : manifestFlagsError(manifest, "the manifest");
    if (manifest.head == null) {
        // scripts/build-provenance.mjs without git: no commit, and the tree not known to be clean.
        add(
            "built where git could not describe the tree, so its commit and cleanliness are unknown",
            `in a git checkout, ${rebuild}`,
        );
    } else if (flagsError) {
        add(`${flagsError}, ${BROKEN_MANIFEST}`, "run `npm run build`");
    } else if (manifest.clean !== true) {
        add(`built from a dirty tree (${(manifest.dirtyPaths ?? []).join(", ")})`, rebuild);
    }
    if (observed.bundleSha256 !== manifest.bundle?.sha256)
        add("the served bundle is not the one built", rebuild);
    const served = manifest.served ?? {};
    // Every served file, whichever arm loads it: session runs come in pairs,
    // and a worker-side file that differs invalidates the pair even when the
    // synchronous run alone does not load it, so both arms refuse.
    const stale = Object.keys(served).filter((p) => observed.served?.[p] !== served[p].sha256);
    if (stale.length > 0) add(`served files differ from the build: ${stale.join(", ")}`, rebuild);
    const loaded = observed.loaded ?? [];
    const unlisted = loaded.filter((p) => p !== manifest.bundle?.path && !(p in served));
    if (unlisted.length > 0)
        add(`modules loaded that the manifest does not list: ${unlisted.join(", ")}`, rebuild);
    // Every module this arm loads must be seen loading, the bundle included: a
    // module missing from the timeline cannot be checked for the cache either.
    // The page's own modules on both arms; the worker's in a worker run.
    const arm = detection === "worker" ? ["page", "both", "worker"] : ["page", "both"];
    const needed = Object.keys(served).filter(
        (p) => /\.m?js$/.test(p) && arm.includes(served[p].side),
    );
    const unseen = [manifest.bundle?.path, ...needed].filter((p) => p && !loaded.includes(p));
    if (unseen.length > 0) {
        add(
            `modules this run loads are not in the page's resource timeline, so what ran cannot be seen: ${unseen.join(", ")}`,
            "run it in a browser that records module loads, a worker's included, in the page's resource timeline, as Chrome does",
        );
    }
    const noStore = "serve with Cache-Control: no-store (npx http-server -c-1) and reload";
    const unfetched = observed.unfetched ?? [];
    if (unfetched.length > 0) {
        add(
            `run from the HTTP cache (a hit, or a 304), so what ran is unknown: ${unfetched.join(", ")}`,
            noStore,
        );
    }
    // What the server says now: a response that lets the browser store it can
    // be the next run's stale code. Absent headers are as permissive as any.
    const cacheable = Object.entries(observed.cacheControl ?? {})
        .filter(([, value]) => !/(^|,)\s*no-store\s*(,|$)/i.test(value ?? ""))
        .map(([path, value]) => `${path} (${value ?? "no Cache-Control"})`);
    if (cacheable.length > 0)
        add(`the server lets the browser cache: ${cacheable.join(", ")}`, noStore);
    if (observed.timelineFull)
        add(
            "the resource-timing buffer overflowed, so later loads went unrecorded",
            "reload the page",
        );
    if (found.length === 0) return null;
    const remedies = [...new Set(found.map((f) => f.remedy))];
    return `Provenance: ${found.map((f) => f.reason).join("; ")}. To fix: ${remedies.join("; ")}.`;
}

/**
 * Why `scripts/replay-clips.mjs --packages bundle` cannot run on `manifest`,
 * the build's `examples/dist/provenance.json` (`null` when it could not be
 * read), in one line with its remedy, or `null` when it can. A manifest built
 * where git could not describe the tree (`head` null, which #111 made
 * possible) is refused: its commit is unknown, so the replay could not name
 * the code it ran. So is one whose flags no build writes (#119), as at Start.
 * A dirty tree that its manifest records consistently is not refused here: the
 * replay's header says so.
 */
export function bundleManifestRefusal(manifest) {
    if (!manifest)
        return "--packages bundle needs examples/dist/provenance.json: run `npm run build`";
    if (manifest.head == null) {
        return "--packages bundle needs a manifest whose commit is known: examples/dist/provenance.json was built where git could not describe the tree (head null). To fix: in a git checkout, commit, and run `npm run build`";
    }
    const flagsError = manifestFlagsError(manifest, "examples/dist/provenance.json");
    if (flagsError) {
        return `--packages bundle needs a manifest that a build wrote: ${flagsError}, ${BROKEN_MANIFEST}. To fix: run \`npm run build\``;
    }
    return null;
}

/** {@link provenanceFindings} as Start's refusal: only a session run refuses; any other run only records them. */
export function provenanceRefusal(manifest, observed, { sessionRun, detection = "sync" }) {
    return sessionRun ? provenanceFindings(manifest, observed, { detection }) : null;
}
