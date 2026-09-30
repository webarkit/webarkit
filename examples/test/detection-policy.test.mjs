/*
 *  detection-policy.test.mjs
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

import { describe, expect, it, vi } from "vitest";
import { accountingError } from "../js/bench-metrics.mjs";
import { createDetectionPolicy } from "../js/detection-policy.mjs";

// The tracker's results, reduced to the two fields the policy reads.
const asks = { needsDetection: true, detectionUse: "none" };
const consumed = (needsDetection) => ({ needsDetection, detectionUse: "consumed" });

describe("createDetectionPolicy", () => {
    it("posts on needsDetection when idle, and hands the result to the next process call exactly once", () => {
        const policy = createDetectionPolicy();
        const post = vi.fn();
        expect(policy.take()).toBeNull();

        policy.afterProcess(asks, post);
        expect(post).toHaveBeenCalledTimes(1);
        expect(policy.inFlight).toBe(true);
        expect(policy.held).toBe(false);

        const d = { ok: true };
        policy.arrive(d);
        expect(policy.inFlight).toBe(false);
        expect(policy.held).toBe(true);

        expect(policy.take()).toBe(d);
        expect(policy.take()).toBeNull();
        policy.afterProcess(consumed(false), post);

        expect(policy.accounting()).toEqual({
            requests: 1,
            posted: 1,
            consumptions: 1,
            ignored: 0,
            dropped: 0,
            discardedAtStop: 0,
        });
        expect(policy.inFlight).toBe(false);
        expect(policy.held).toBe(false);
        expect(post).toHaveBeenCalledTimes(1);
    });

    it("does not ask while a lock holds", () => {
        const policy = createDetectionPolicy();
        const post = vi.fn();
        policy.afterProcess({ needsDetection: false, detectionUse: "none" }, post);
        expect(post).not.toHaveBeenCalled();
        expect(policy.accounting().requests).toBe(0);
    });

    it("drops a request while one is in flight, and does not queue it", () => {
        const policy = createDetectionPolicy();
        const post = vi.fn();
        policy.afterProcess(asks, post);
        policy.afterProcess(asks, post);
        policy.afterProcess(asks, post);
        expect(post).toHaveBeenCalledTimes(1);
        expect(policy.accounting()).toMatchObject({ requests: 3, posted: 1, dropped: 2 });

        // The two dropped requests left nothing behind to post once the job ends.
        policy.arrive({});
        policy.take();
        policy.afterProcess(consumed(false), post);
        expect(post).toHaveBeenCalledTimes(1);
        expect(policy.inFlight).toBe(false);
    });

    it("drops a request while a result is held, rather than posting over it", () => {
        const policy = createDetectionPolicy();
        const post = vi.fn();
        policy.afterProcess(asks, post);
        policy.arrive({});
        policy.afterProcess(asks, post);
        expect(post).toHaveBeenCalledTimes(1);
        expect(policy.held).toBe(true);
        expect(policy.accounting()).toMatchObject({ requests: 2, posted: 1, dropped: 1 });
    });

    it("posts again from the very call that refused a consumed detection", () => {
        const policy = createDetectionPolicy();
        const post = vi.fn();
        policy.afterProcess(asks, post);
        policy.arrive({});
        expect(policy.take()).not.toBeNull();
        policy.afterProcess(consumed(true), post);

        expect(post).toHaveBeenCalledTimes(2);
        expect(policy.inFlight).toBe(true);
        expect(policy.accounting()).toEqual({
            requests: 2,
            posted: 2,
            consumptions: 1,
            ignored: 0,
            dropped: 0,
            discardedAtStop: 0,
        });
    });

    it("counts an in-flight job and a held one as discarded at Stop, and ignores arrivals after it", () => {
        const inFlight = createDetectionPolicy();
        const post = vi.fn();
        inFlight.afterProcess(asks, post);
        inFlight.stop();
        expect(inFlight.accounting()).toMatchObject({ requests: 1, discardedAtStop: 1 });
        expect(inFlight.inFlight).toBe(false);

        // The worker's answer to the discarded job arrives after Stop: not an error, and not held.
        expect(() => inFlight.arrive({})).not.toThrow();
        expect(inFlight.held).toBe(false);
        expect(inFlight.take()).toBeNull();
        // Nor does a frame that still finishes after Stop ask for another.
        inFlight.afterProcess(asks, post);
        expect(post).toHaveBeenCalledTimes(1);
        expect(inFlight.accounting()).toEqual({
            requests: 1,
            posted: 1,
            consumptions: 0,
            ignored: 0,
            dropped: 0,
            discardedAtStop: 1,
        });

        const held = createDetectionPolicy();
        held.afterProcess(asks, post);
        held.arrive({});
        held.stop();
        expect(held.accounting()).toMatchObject({ requests: 1, discardedAtStop: 1 });
        expect(held.held).toBe(false);
        expect(held.take()).toBeNull();

        const idle = createDetectionPolicy();
        idle.stop();
        idle.stop();
        expect(idle.accounting().discardedAtStop).toBe(0);
        held.stop();
        expect(held.accounting().discardedAtStop).toBe(1);
    });

    it("counts a detection handed in while a lock held as ignored, and the accounting refuses it", () => {
        const policy = createDetectionPolicy();
        const post = vi.fn();
        policy.afterProcess(asks, post);
        policy.arrive({});
        expect(policy.take()).not.toBeNull();
        policy.afterProcess({ needsDetection: false, detectionUse: "ignored" }, post);
        policy.stop();

        expect(policy.accounting()).toMatchObject({ consumptions: 0, ignored: 1 });
        expect(accountingError(policy.accounting())).toMatch(/ignored/);
    });

    it.each([["none"], ["internal"], [undefined]])(
        "throws when a handed-in detection is neither consumed nor ignored (detectionUse %s)",
        (detectionUse) => {
            const policy = createDetectionPolicy();
            policy.afterProcess(asks, vi.fn());
            policy.arrive({});
            expect(policy.take()).not.toBeNull();
            expect(() =>
                policy.afterProcess({ needsDetection: false, detectionUse }, vi.fn()),
            ).toThrow("a handed-in detection was neither consumed nor ignored");
        },
    );

    it("throws when a result arrives with nothing in flight", () => {
        const policy = createDetectionPolicy();
        expect(() => policy.arrive({})).toThrow(/nothing in flight/);

        policy.afterProcess(asks, vi.fn());
        policy.arrive({});
        expect(() => policy.arrive({})).toThrow(/nothing in flight/);
    });

    it("reports a snapshot of its counts, not the live ones", () => {
        const policy = createDetectionPolicy();
        const before = policy.accounting();
        policy.afterProcess(asks, vi.fn());
        expect(before.requests).toBe(0);
        expect(policy.accounting().requests).toBe(1);
    });

    // mulberry32: a small seeded generator, so the run is the same every time.
    const seeded = (seed) => () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    it.each([1, 2, 3, 4, 5])(
        "keeps requests = consumptions + dropped + discardedAtStop over a random run (seed %i)",
        (seed) => {
            const random = seeded(seed);
            const policy = createDetectionPolicy();
            let pending = 0; // jobs the page posted whose result it has not yet delivered
            const post = () => {
                pending++;
            };
            let ran = 0;
            // Stop lands somewhere in the second half; the steps after it are
            // the page's late events, which the policy must ignore.
            const stopAt = 1000 + Math.floor(random() * 1000);
            for (let step = 0; step < 2000; step++) {
                const roll = random();
                if (step === stopAt) {
                    policy.stop();
                } else if (roll < 0.45 && pending > 0) {
                    // The worker's answer arrives, between two frames. After Stop the
                    // page's handler still runs, and the policy must ignore it.
                    pending--;
                    policy.arrive({});
                } else {
                    // A frame: take, process, afterProcess. The tracker consumes what
                    // it is handed, and asks again on a frame that ends without a lock.
                    const handed = policy.take() !== null;
                    ran++;
                    policy.afterProcess(
                        {
                            needsDetection: random() < 0.6,
                            detectionUse: handed ? "consumed" : "none",
                        },
                        post,
                    );
                }
                // Mid-run, at most one job is unresolved, and it is the one the identity lacks.
                const acc = policy.accounting();
                const unresolved = policy.inFlight || policy.held ? 1 : 0;
                expect(acc.requests).toBe(
                    acc.consumptions + acc.dropped + acc.discardedAtStop + unresolved,
                );
            }
            policy.stop();

            const acc = policy.accounting();
            expect(accountingError(acc)).toBeNull();
            // The run exercised what it claims to: not a vacuous identity over zeros.
            expect(ran).toBeGreaterThan(500);
            expect(acc.consumptions).toBeGreaterThan(20);
            expect(acc.dropped).toBeGreaterThan(20);
        },
    );
});
