/**
 * Errors the contract requires backends to throw.
 *
 * These are the one piece of RUNTIME code in an otherwise types-only package,
 * and they earn it: the negotiation rules in `cv_backend.ts` are only useful if
 * a caller can catch a refusal uniformly. If each backend threw its own error
 * type — or a bare `Error` — the high-level layer would be reduced to matching
 * on message strings to tell "this backend cannot do that" apart from "this
 * backend broke", which is exactly the distinction it needs in order to fall
 * back to another descriptor rather than give up on the frame.
 *
 * Both carry the supported set, not just the rejected request, so the message
 * alone is enough to debug a mis-wired pipeline without reading the backend.
 */

/** Discriminator for {@link UnsupportedCapabilityError}. */
export type CapabilityKind = "descriptor" | "detector" | "matchFilter";

/**
 * A caller explicitly asked for something this backend does not implement.
 *
 * Thrown rather than silently substituting a supported alternative: picking a
 * fallback is the high-level layer's decision, made against
 * `BackendCapabilities`. A backend that guessed would hide the divergence the
 * caller needs to see.
 */
export class UnsupportedCapabilityError extends Error {
    /** Which family of capability was requested. */
    readonly capability: CapabilityKind;
    /** The unsupported value that was asked for. */
    readonly requested: string;
    /** What this backend does support, for the caller to fall back onto. */
    readonly supported: readonly string[];
    /** The backend that refused, from `BackendCapabilities.name`. */
    readonly backend: string;

    constructor(capability: CapabilityKind, requested: string, supported: readonly string[], backend: string) {
        const list = supported.length ? supported.join(", ") : "none";
        super(`Backend "${backend}" does not support ${capability} "${requested}". Supported: ${list}.`);
        this.name = "UnsupportedCapabilityError";
        this.capability = capability;
        this.requested = requested;
        this.supported = supported;
        this.backend = backend;
        // Required for `instanceof` to survive a compile down to ES5.
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Two descriptor sets that cannot be compared were handed to `match`.
 *
 * This guards the worst failure mode in the system. ORB and 256-bit TEBLID are
 * both 32 bytes and both Hamming-compared, so matching one against the other
 * throws nothing and returns confident, meaningless distances: RANSAC then
 * finds no consensus and the tracker simply never locks on, with no error
 * anywhere to point at the cause.
 */
export class DescriptorMismatchError extends Error {
    readonly queryKind: string;
    readonly trainKind: string;
    readonly queryNorm: string;
    readonly trainNorm: string;

    constructor(queryKind: string, queryNorm: string, trainKind: string, trainNorm: string) {
        super(
            `Cannot match descriptors: query is ${queryKind}/${queryNorm}, ` +
                `train is ${trainKind}/${trainNorm}. Both the family and the norm must agree.`
        );
        this.name = "DescriptorMismatchError";
        this.queryKind = queryKind;
        this.trainKind = trainKind;
        this.queryNorm = queryNorm;
        this.trainNorm = trainNorm;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
