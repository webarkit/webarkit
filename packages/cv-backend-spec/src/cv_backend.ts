/**
 * Minimum CV backend interface.
 *
 * The contract the high-level AR project depends on. It exposes only the
 * stateless computer-vision primitives; everything stateful and AR-specific
 * (target training, tracking loop, pose refinement, validation, temporal
 * filtering, renderer adapters) lives above this line and is written once
 * against this interface.
 *
 * Two interchangeable implementations are expected:
 *   - jsfeatNext (TypeScript) — reference / fast to iterate, numeric oracle.
 *   - PureCV (Rust -> WASM)   — production performance.
 *
 * Boundary contract (matters for the WASM implementation):
 *   1. Types are neutral — typed arrays and plain structs, never jsfeatNext's
 *      `matrix_t`/`keypoint_t`. Each backend converts internally.
 *   2. Compute methods are SYNCHRONOUS. They are pure CPU functions over
 *      buffers; a loaded WASM module runs them synchronously too. If you want
 *      to offload work, offload a whole pipeline step to a Worker — do not make
 *      individual primitives async and pay a boundary crossing per call.
 *   3. Returned typed arrays are OWNED BY THE CALLER (copies out of any WASM
 *      heap). This avoids aliasing bugs where the next call invalidates a view.
 *      A zero-copy "borrow" fast path can be added later behind a flag.
 *   4. Geometry is Float64 for precision (H, K, R, t); pixels/descriptors are
 *      Uint8; point lists are Float64 interleaved [x0,y0,x1,y1,...].
 *
 * Backends are interchangeable because they share these signatures — but only
 * as far as they share CAPABILITIES. Once one backend has a descriptor another
 * lacks, signatures alone stop being enough, so what a backend implements is
 * itself part of the contract: see {@link BackendCapabilities}.
 */

/** Row-major 3x3 matrix, length 9. Used for H, K, R. */
export type Mat3 = Float64Array;

/** 3-vector, length 3. Used for t. */
export type Vec3 = Float64Array;

/** Interleaved 2D points [x0, y0, x1, y1, ...]; count = length / 2. */
export type PointArray = Float64Array;

/** Single-channel 8-bit image. RGBA -> gray is a preprocessing step above. */
export interface GrayImage {
    data: Uint8Array;
    width: number;
    height: number;
}

export interface Keypoint {
    x: number;
    y: number;
    score: number;
    angle: number; // radians; 0 if the detector is not oriented
    level: number; // pyramid octave the point was found at
}

/**
 * Keypoint detectors a backend may implement. Extend as new detectors land;
 * backends declare support via {@link BackendCapabilities.detectors}.
 *
 * Declared here so the high-level layer can *discover* which detectors exist,
 * even though {@link DetectOptions} does not yet carry a selector — wiring one
 * in is a follow-up, and adding it later is source-compatible.
 */
export type DetectorKind = "fast" | "yape" | "yape06" | "orb" | "akaze";

/**
 * Binary descriptor families a backend may implement.
 * Extend as new descriptors land; backends declare support via
 * {@link BackendCapabilities.descriptors}.
 */
export type DescriptorKind = "orb" | "freak" | "beblid" | "teblid" | "akaze";

/**
 * Distance metric the descriptors must be compared with.
 *
 * Every kind above is binary/Hamming today. The field exists so that a future
 * float descriptor cannot silently be matched with the wrong metric — the one
 * failure that produces plausible-looking numbers instead of an error.
 */
export type DescriptorNorm = "hamming" | "l2";

export interface DescribeOptions {
    /**
     * Descriptor family to compute. Omit for the backend's
     * {@link BackendCapabilities.defaultDescriptor}.
     *
     * Requesting a kind the backend does not implement MUST throw
     * ({@link UnsupportedCapabilityError}) rather than fall back — see
     * "Negotiation" on {@link CvBackend}.
     */
    kind?: DescriptorKind;
    /**
     * Descriptor size in bits, where the family supports more than one
     * (e.g. BEBLID/TEBLID: 256 or 512). Ignored by fixed-size families.
     */
    bits?: number;
}

/**
 * Binary descriptors packed row-major: `count` rows of `bytesPerDescriptor`.
 *
 * Self-describing on purpose. Two descriptor sets of different families can
 * have byte-identical shape (ORB and 256-bit TEBLID are both 32 bytes) and
 * compare without error under the same Hamming metric, yielding meaningless
 * distances. Carrying {@link kind} and {@link norm} lets `match` reject that
 * pairing outright instead of returning confident nonsense.
 */
export interface Descriptors {
    data: Uint8Array;
    count: number;
    bytesPerDescriptor: number; // 32 for ORB
    /** The family actually produced — not what was requested. */
    kind: DescriptorKind;
    /** How these descriptors must be compared. */
    norm: DescriptorNorm;
}

/** One correspondence, equivalent to OpenCV's cv::DMatch. */
export interface Match {
    queryIdx: number;
    trainIdx: number;
    distance: number;
}

export interface HomographyResult {
    H: Mat3;
    inliers: Uint8Array; // mask over the input correspondences (1 = inlier)
    numInliers: number;
    ok: boolean; // false if estimation failed / too few inliers
}

export interface Pose {
    R: Mat3; // rotation, OpenCV camera frame (camera looks down +Z)
    t: Vec3; // translation, in the units of the model-plane coordinates
    good: boolean; // false if H/K were degenerate
}

export interface DetectOptions {
    maxKeypoints?: number;
    threshold?: number; // detector response threshold
    levels?: number; // pyramid levels to search
}

export interface MatchOptions {
    /** If set, run k=2 + Lowe ratio test internally and keep good matches. */
    ratio?: number;
    /** Mutually-best filtering; ignored when `ratio` is set. */
    crossCheck?: boolean;
    /** Drop matches whose Hamming distance exceeds this. */
    maxDistance?: number;
}

/**
 * A keypoint set together with the dimensions of the image it came from.
 *
 * Geometric filters need both: grid-based methods bin keypoints by normalised
 * position, so the image size is not recoverable from the keypoints alone.
 */
export interface FilterView {
    keypoints: Keypoint[];
    width: number;
    height: number;
}

/**
 * Geometric match-filtering families a backend may implement.
 *
 * A union rather than a boolean so further families (LOGOS, ...) can be added
 * without another contract change.
 */
export type MatchFilterKind = "gms";

export interface FilterOptions {
    /** Filter family. Defaults to the backend's only/preferred implementation. */
    kind?: MatchFilterKind;
    /** GMS: score threshold factor (alpha). Reference default: 6. */
    thresholdFactor?: number;
    /**
     * GMS: evaluate the 8 neighbourhood rotation patterns. Costs ~8x, buys
     * rotation invariance. Reference default: false.
     */
    withRotation?: boolean;
    /**
     * GMS: evaluate the 5 grid scale ratios. Costs ~5x, buys scale
     * invariance. Reference default: false.
     */
    withScale?: boolean;
    /** GMS: grid subdivision per axis. Reference default: 20. */
    gridSize?: number;
}

export interface RansacOptions {
    threshold?: number; // reprojection threshold in pixels
    maxIterations?: number;
    confidence?: number; // 0..1
}

/**
 * Static description of what a backend implements.
 *
 * The high-level layer reads this to choose deterministically from its own
 * preference order, so the backend never guesses on the caller's behalf:
 *
 * ```ts
 * const preferred: DescriptorKind[] = ["teblid", "freak", "orb"];
 * const kind =
 *     preferred.find((k) => cv.capabilities.descriptors.includes(k)) ??
 *     cv.capabilities.defaultDescriptor;
 * ```
 */
export interface BackendCapabilities {
    /** Human-readable backend id, e.g. 'jsfeatnext', 'purecv-wasm'. */
    readonly name: string;
    /** Detectors this backend can run. */
    readonly detectors: readonly DetectorKind[];
    /** Descriptor families this backend can compute. */
    readonly descriptors: readonly DescriptorKind[];
    /** Descriptor used when {@link DescribeOptions.kind} is omitted. */
    readonly defaultDescriptor: DescriptorKind;
    /**
     * Geometric match filters this backend can apply. Empty when
     * {@link CvBackend.filterMatches} is not implemented.
     */
    readonly matchFilters: readonly MatchFilterKind[];
}

/**
 * The stateless CV surface. An implementation holds no per-frame state; all
 * inputs are passed in explicitly and all outputs are owned by the caller.
 *
 * ## Negotiation
 *
 * These rules are as much a part of the contract as the signatures. They exist
 * to convert silent, expensive-to-debug failures into immediate ones:
 *
 * - **Omitting an option is always valid** and selects the backend default, so
 *   a caller written against the unamended contract keeps working unchanged.
 * - **An unsupported EXPLICIT request throws** {@link UnsupportedCapabilityError}
 *   — never a silent substitution. Choosing a fallback is the high-level
 *   layer's decision, made against {@link capabilities}; a backend that guessed
 *   would hide the very divergence the caller needs to see.
 * - **`match` rejects mismatched descriptor sets.** This is the cheap guard on
 *   the worst failure mode in the system: a target trained with one descriptor
 *   family and matched against another produces no exception, no obviously bad
 *   output, just a tracker that never locks on.
 */
export interface CvBackend {
    /** What this backend implements. Cheap, no side effects, constant per instance. */
    readonly capabilities: BackendCapabilities;

    /** Detect keypoints in a grayscale image. */
    detect(image: GrayImage, options?: DetectOptions): Keypoint[];

    /**
     * Compute binary descriptors for the given keypoints (OpenCV: `compute`).
     *
     * @throws {UnsupportedCapabilityError} if `options.kind` is given and is not
     *         in {@link BackendCapabilities.descriptors}.
     */
    describe(image: GrayImage, keypoints: Keypoint[], options?: DescribeOptions): Descriptors;

    /** Convenience: detect + describe in one pass (may reuse the pyramid). */
    detectAndCompute?(
        image: GrayImage,
        options?: DetectOptions & DescribeOptions
    ): { keypoints: Keypoint[]; descriptors: Descriptors };

    /**
     * Brute-force match of query descriptors against train, using the metric
     * the descriptors declare.
     *
     * @throws {DescriptorMismatchError} if `query.kind !== train.kind` or the
     *         norms differ.
     */
    match(query: Descriptors, train: Descriptors, options?: MatchOptions): Match[];

    /**
     * Optional geometric consistency filter, applied between {@link match} and
     * {@link estimateHomography}. Returns a SUBSET of the input matches.
     *
     * Raising the inlier ratio before RANSAC runs is worth more than it looks:
     * the iterations needed for a given confidence go as
     * `log(1 - p) / log(1 - r^4)`, so the 4-point minimal sample makes the cost
     * fall steeply as `r` rises.
     *
     * Implementations MUST preserve `queryIdx`/`trainIdx`/`distance` exactly and
     * MUST NOT renumber or synthesise matches — callers still hold the keypoint
     * arrays those indices point into.
     *
     * Backends that do not implement it omit the method entirely and declare
     * `matchFilters: []`; the caller then proceeds with unfiltered matches:
     *
     * ```ts
     * if (cv.filterMatches) matches = cv.filterMatches(matches, q, t);
     * ```
     *
     * @throws {UnsupportedCapabilityError} if `options.kind` is given and is not
     *         in {@link BackendCapabilities.matchFilters}.
     */
    filterMatches?(matches: Match[], query: FilterView, train: FilterView, options?: FilterOptions): Match[];

    /**
     * Estimate the planar homography mapping `src` points to `dst` points
     * (RANSAC). `src[i]` corresponds to `dst[i]`.
     */
    estimateHomography(src: PointArray, dst: PointArray, options?: RansacOptions): HomographyResult;

    /**
     * Decompose a planar homography into a camera pose given intrinsics `K`.
     * Pure geometry — returns R, t in the camera frame; converting to a
     * renderer matrix (GL modelview/projection) is a high-level adapter, not
     * part of this contract.
     */
    poseFromHomography(H: Mat3, K: Mat3): Pose;
}

/**
 * Async factory: WASM instantiation is async, but the returned backend's
 * methods are all synchronous. A pure-TS backend resolves immediately.
 *
 *   const cv = await createJsfeatBackend();   // or createPureCvBackend()
 *   const kps = cv.detect(frame);
 */
export type CreateCvBackend = () => Promise<CvBackend>;
