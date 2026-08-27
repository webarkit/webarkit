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

/** Binary descriptors packed row-major: `count` rows of `bytesPerDescriptor`. */
export interface Descriptors {
    data: Uint8Array;
    count: number;
    bytesPerDescriptor: number; // 32 for ORB
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

export interface RansacOptions {
    threshold?: number; // reprojection threshold in pixels
    maxIterations?: number;
    confidence?: number; // 0..1
}

/**
 * The stateless CV surface. An implementation holds no per-frame state; all
 * inputs are passed in explicitly and all outputs are owned by the caller.
 */
export interface CvBackend {
    /** Detect keypoints in a grayscale image. */
    detect(image: GrayImage, options?: DetectOptions): Keypoint[];

    /** Compute binary descriptors for the given keypoints (OpenCV: `compute`). */
    describe(image: GrayImage, keypoints: Keypoint[]): Descriptors;

    /** Convenience: detect + describe in one pass (may reuse the pyramid). */
    detectAndCompute?(
        image: GrayImage,
        options?: DetectOptions
    ): { keypoints: Keypoint[]; descriptors: Descriptors };

    /** Brute-force Hamming match of query descriptors against train. */
    match(query: Descriptors, train: Descriptors, options?: MatchOptions): Match[];

    /**
     * Estimate the planar homography mapping `src` points to `dst` points
     * (RANSAC). `src[i]` corresponds to `dst[i]`.
     */
    estimateHomography(
        src: PointArray,
        dst: PointArray,
        options?: RansacOptions
    ): HomographyResult;

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
