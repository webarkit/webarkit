# NFT target format — v0.1

**Status:** Accepted (format 0.1). The format version is `0.1`: while the major is `0`, every minor may break compatibility (§7).
**Decided by:** [ADR-0001](../adr/0001-nft-tracker-ts-reference-above-cvbackend.md), point 6.
**Implementations:** `packages/nft-tracker/src/target/format` (TypeScript, which also hosts the fixture generator) and `crates/wnft-format` (Rust). The two are peers: this specification is the source of truth, and two independent implementations exist to expose its ambiguities.

The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## 1. Purpose

A trained NFT target is everything the tracker needs to find and follow one planar image: keypoints, descriptors, pyramid geometry, tracking patches and physical size. This document defines the file that stores it, with the extension `.wnft`.

The format is the contract between tracker implementations. A file written by one implementation MUST decode to the same values in any other.

**Non-goals:**
- Compatibility with ARToolKit `.iset` / `.fset` / `.fset3` files.
- Compression inside the file. Serve it with HTTP `gzip`/`br` instead.
- Storing backend-internal structures (`matrix_t`, KPM trees, search indices). Indices are built at load time.

A `.wnft` file can be delivered on its own, or embedded unchanged in a WASM module or a bundle (Rust `include_bytes!`, Emscripten `--embed-file`). This specification defines only the bytes; §3 covers alignment when a file is embedded.

## 2. Design at a glance

The format has two layers, following the GLB container of glTF 2.0:

```
┌ container header ┐┌ JSON chunk ─────────┐┌ BIN chunk ──────────────────────┐
  magic, version,     manifest: structure,   bulk arrays: coordinates,
  total length        meaning, parameters    descriptors, patches, pixels
```

- **Container** (§4): framing only — magic, container version, lengths, CRC-32 checksums. It is expected to change almost never.
- **Manifest** (§5): a JSON object describing everything in the file — what each array is, which descriptor families are present, their parameters. It carries the **format version** and evolves with this specification.
- **Data chunk:** every bulk array, aligned so that readers can view it without copying. Arrays are located through **accessors** in the manifest (offset, element count, element type), never through offsets computed from other fields.

Two properties follow from this split:

- **Adding something never shifts existing bytes.** A new field is a new manifest key; a new array is a new accessor. Old readers ignore both (§7).
- **Versioning happens at two layers, and each version governs only its own layer** (§7). This is not duplication: a reader must be able to reject a container it cannot frame *before* it looks for the manifest, and it can only read the format version *after* framing.

## 3. Conventions

**Byte order.** All multi-byte values are little-endian. Every platform WebARKit targets is little-endian, so readers MAY view arrays directly. TS readers SHOULD assert this once at load time:

```ts
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
```

**Alignment.** Chunk data starts at a file offset that is a multiple of 8, and every accessor's offset is a multiple of its element size (the canonical writer uses 8). All padding is defined in §4.

When a file is not at an 8-aligned address — for example, a `.wnft` stored inside a larger `ArrayBuffer`, or embedded with Rust `include_bytes!`, which only guarantees 1-byte alignment — views may be impossible. JS typed arrays require the byte offset to be a multiple of the element size. Readers MUST detect this and fall back to copying the affected arrays. They MUST NOT read misaligned data through a view.

**Pixel coordinates.** Integer coordinates are pixel centres, so a FAST corner at column 10 has `x = 10`. All keypoint and patch positions are stored in **level-0 coordinates**, i.e. pixels of the full-resolution reference image.

**Level-to-level-0 mapping.** A point found at `x_l` on level `l` is stored as

```
x0 = x_l / s_l,   where s_l = scale_step^(-l)
```

with **no half-pixel correction**. This matches `cv-backend-jsfeatnext` (`x: k.x / scale`) and OpenCV's ORB (decision D2).

**Model plane.** The target lies on the plane `Z = 0`. Units are millimetres, the origin is at level-0 pixel `(0, 0)`, `+X` points right and `+Y` points down, matching the image axes (decision D1):

```
X_mm = x0 · physicalWidthMm  / widthPx
Y_mm = y0 · physicalHeightMm / heightPx
```

With these axes, the pose from `poseFromHomography` follows OpenCV conventions, as the contract specifies. Converting to renderer conventions (GL, Y-up) and centring content on the target are the job of the tracker API and the renderer adapter, never of the file. If the physical size is unknown (`physicalSizeMm: null`), model-plane units are level-0 pixels.

**Angles.** Stored in radians exactly as the detector produced them. Readers MUST NOT assume a range; angles are periodic.

## 4. Container

### 4.1 Header

| Offset | Size | Type | Field | Notes |
|---|---|---|---|---|
| 0 | 4 | `u8[4]` | `magic` | `"WKNF"` = `57 4B 4E 46` |
| 4 | 2 | `u16` | `container_major` | `1` |
| 6 | 2 | `u16` | `container_minor` | `0` |
| 8 | 4 | `u32` | `total_length` | Length of the whole file, header included |
| 12 | 4 | `u32` | `flags` | Reserved. MUST be `0` |

`total_length` MUST equal the length of the buffer the reader is given. This catches truncated downloads before anything else is read.

### 4.2 Chunks

Chunks follow the header back to back until `total_length`. Each chunk has a 16-byte header:

| Offset | Size | Type | Field | Notes |
|---|---|---|---|---|
| 0 | 4 | `u32` | `chunk_length` | Bytes of chunk data, **excluding** padding |
| 4 | 4 | `u8[4]` | `chunk_type` | `"JSON"` or `"BIN\0"`; others reserved |
| 8 | 4 | `u32` | `crc32` | CRC-32 of the chunk data, excluding padding |
| 12 | 4 | `u32` | reserved | MUST be `0` |
| 16 | `chunk_length` | — | data | |

After the data, the chunk is padded to a multiple of 8 bytes. The `JSON` chunk is padded with spaces (`0x20`); every other chunk is padded with zeros. With a 16-byte file header and 16-byte chunk headers, every chunk's data therefore starts at an 8-aligned offset.

**Chunk rules:**
- The first chunk MUST be `JSON`. There is exactly one.
- The second chunk, if present, MUST be `BIN\0`. There is at most one. It MUST be present if the manifest declares any accessor.
- Any chunk after these is ignored by readers that do not know its type (warning `UNKNOWN_CHUNK_SKIPPED`). This leaves room for future container minors.

**Checksum.** `crc32` is CRC-32/ISO-HDLC — polynomial `0x04C11DB7` (reflected `0xEDB88320`), initial value and final XOR `0xFFFFFFFF` — the same as zlib, PNG and Rust's `crc32fast`. Test vector: the ASCII bytes `123456789` give `0xCBF43926`.

CRC-32 detects **accidental** corruption: a truncated or damaged download, a broken cache entry, a bad copy. It does not detect deliberate tampering, because anyone who modifies the data can recompute it. Protection against tampering comes from the transport (HTTPS, Subresource Integrity), not from this format.

## 5. Manifest

The `JSON` chunk holds one JSON object: UTF-8, no BOM.

### 5.1 Top level

```json
{
  "format": { "version": "0.1", "generator": "@webarkit/nft-tracker 0.1.0" },
  "extensionsUsed": [],
  "extensionsRequired": [],
  "meta": { },
  "pyramid": { },
  "keypoints": { },
  "descriptorSets": [ ],
  "patches": { },
  "referenceImage": { },
  "info": { },
  "accessors": [ ]
}
```

| Key | Required | Content |
|---|---|---|
| `format` | yes | `version` as `"MAJOR.MINOR"` (§7); `generator` free text, optional |
| `extensionsUsed` | no | Names of extensions present in the file |
| `extensionsRequired` | no | Subset of `extensionsUsed` a reader MUST understand to read the file correctly |
| `meta` | yes | §5.3 |
| `pyramid` | yes | §5.4 |
| `keypoints` | yes | §5.5 |
| `descriptorSets` | yes | §5.6, at least one entry |
| `patches` | no | §5.7 |
| `referenceImage` | no | §5.8 |
| `info` | no | §5.9 |
| `accessors` | yes | §5.2 |

**Unknown keys.** Readers MUST ignore keys they do not know, at every level. Writers MUST NOT use a new key to change the meaning of existing data (§7).

**Extensions.** An extension has a name with the `WKNF_` prefix (e.g. `WKNF_multiview`) and may attach data to any object under an `"extensions": { "WKNF_name": { … } }` key, as in glTF.

### 5.2 Accessors

Every array lives in the `BIN` chunk and is described by an accessor. Manifest fields refer to accessors by their index in `accessors`.

```json
{ "offset": 0, "count": 1000, "type": "f32" }
```

| Field | Content |
|---|---|
| `offset` | Byte offset from the start of the `BIN` chunk data. MUST be a multiple of the element size |
| `count` | Number of elements (not bytes) |
| `type` | `"u8"`, `"u16"`, `"u32"` or `"f32"` |

Accessor rules:
- `offset + count × size(type)` MUST be `≤` the `BIN` chunk length, computed with checked arithmetic (§6.1).
- Accessors MUST NOT overlap. Each array owns its bytes.
- Every field that references an accessor fixes the expected `type` and `count`. A mismatch is `BAD_LAYOUT`.
- Accessors that no known field references are allowed and ignored; they may belong to an extension.

### 5.3 `meta`

```json
{ "widthPx": 1024, "heightPx": 768, "physicalSizeMm": [210, 157.5] }
```

`widthPx` and `heightPx` MUST equal `pyramid.levelSizes[0]`. `physicalSizeMm` is `[width, height]` in millimetres, both `> 0`, or `null` if unknown.

### 5.4 `pyramid`

```json
{ "scaleStep": 1.2599210498948732, "levelSizes": [[1024, 768], [812, 609], [645, 484]] }
```

- `scaleStep` is the size ratio between consecutive levels, e.g. `2^(1/3)`.
- The number of levels `L` is `levelSizes.length`, at least 1.
- `levelSizes` are authoritative. Implementations round differently — `cv-backend-jsfeatnext` uses `(w * s) | 0` — so sizes are recorded as produced, not recomputed.

`scaleStep` is what gives meaning to a keypoint's `level`. The contract carries the level but not the step (ADR-0001, contract gaps).

### 5.5 `keypoints`

```json
{
  "count": 1000,
  "detector": { "kind": "fast", "params": { "threshold": 20 } },
  "levelStart": 0, "x": 1, "y": 2, "angle": 3, "score": 4, "size": 5, "level": 6
}
```

| Field | Accessor type, count | Content |
|---|---|---|
| `count` | — | `N` |
| `detector` | — | `kind` (a `DetectorKind` string) and free-form `params`. Informative, except where a descriptor's parameters depend on the detector (§5.6) |
| `levelStart` | `u32`, `L + 1` | Keypoints of level `l` are the indices `[levelStart[l], levelStart[l+1])`; `levelStart[L] = N` |
| `x`, `y` | `f32`, `N` | Level-0 coordinates (§3) |
| `angle` | `f32`, `N` | Radians |
| `score` | `f32`, `N` | Detector response |
| `size` | `f32`, `N` | Optional. Diameter, in level-0 pixels, of the region the descriptor sampled. Absent means unknown |
| `level` | `u8`, `N` | Pyramid level. MUST agree with `levelStart` |

Keypoints MUST be sorted by level, ascending. `f32` is used rather than `f64` because it halves the arrays and its precision at 4096 px (~0.0005 px) is far below detector accuracy. Readers widen to `Float64` when building the contract's `PointArray`.

These fields map directly onto the contract's `Keypoint` (`x`, `y`, `score`, `angle`, `level`).

### 5.6 `descriptorSets`

Each entry is one descriptor set:

```json
{
  "kind": "teblid",
  "norm": "hamming",
  "elementType": "bits",
  "dimensions": 256,
  "bytesPerDescriptor": 32,
  "producer": "purecv",
  "params": { "scaleFactor": 1.0 },
  "count": 1000,
  "levelStart": 7, "kpIndex": 8, "data": 9
}
```

| Field | Content |
|---|---|
| `kind` | A `DescriptorKind` string, e.g. `"orb"`, `"freak"`, `"teblid"` |
| `norm` | Distance: `"hamming"`, `"hamming2"`, `"l2"`, … |
| `elementType` | `"bits"` (packed binary), `"u8"` or `"f32"` |
| `dimensions` | Number of bits for `"bits"`, number of elements otherwise |
| `bytesPerDescriptor` | MUST equal `dimensions / 8` for `"bits"` (`dimensions` a multiple of 8), `dimensions` for `"u8"`, `4 × dimensions` for `"f32"` |
| `producer` | `capabilities.name` of the backend that computed the set, e.g. `"jsfeatnext"` |
| `params` | Free-form, family-specific parameters, e.g. `{ "wtaK": 2 }` for ORB, `{ "scaleFactor": 1.0 }` for TEBLID. MAY be empty |
| `count` | Rows `M` |
| `levelStart` | `u32` accessor, `L + 1` entries: row ranges per level |
| `kpIndex` | `u32` accessor, `M` entries: the keypoint each row describes |
| `data` | Accessor with `type` `"u8"` for `"bits"` and `"u8"`, `"f32"` for `"f32"`; `count` = `M × bytesPerDescriptor` for `"u8"`, `M × dimensions` for `"f32"` |

**Several sets, and what they are for.** A file MAY contain several sets. For example, `orb` and `teblid` let one file serve backends with different capabilities (§6.3). Two `orb` sets from different producers work around the "same kind, different bits" problem (ADR-0001, contract gaps). Uniqueness is on the key (`kind`, `norm`, `dimensions`, `producer`): two sets with the same key are `INCONSISTENT_DATA`.

**Unknown families don't break the file.** A set whose `kind`, `norm` or `elementType` the reader does not know becomes unusable, with the warning `UNSUPPORTED_DESCRIPTOR_SET`. The rest of the file stays readable. Only a *structurally* broken set (an accessor out of bounds, `levelStart` inconsistent) makes the whole file invalid.

**Rows are grouped by level**, in the same order as the keypoints. Per-level matching can therefore view one level without copying:

```ts
const bpd = set.bytesPerDescriptor;
const a = set.levelStart[l], b = set.levelStart[l + 1];
const levelSet: Descriptors = {
    data: set.data.subarray(a * bpd, b * bpd),   // a view, not a copy
    count: b - a, bytesPerDescriptor: bpd, kind: set.kind, norm: set.norm,
};
// after match(query, levelSet, …): keypoint index = set.kpIndex[a + m.trainIdx]
```

**Multi-view descriptors.** `kpIndex` lets several rows describe the same keypoint, e.g. descriptors computed on synthetic views (milestone M4). Multi-view rows break Lowe's ratio test, for the same reason pooled levels do (hence `matchPerLevel`): the two nearest rows can both be correct. A correct test requires the second-best row to belong to a *different* keypoint, which needs k-nearest matching that the contract does not expose yet.

A reader that ignored `kpIndex` would therefore silently produce a worse ratio test. For that reason, `M ≠ N` or any repeated `kpIndex` value is allowed **only** when the extension `WKNF_multiview` is listed in `extensionsRequired`. Without it, writers MUST emit exactly one row per keypoint (`M = N`, `kpIndex[i] = i`).

### 5.7 `patches` (optional)

| Field | Accessor type, count | Content |
|---|---|---|
| `patchSize` | — | `P`, e.g. 8 |
| `count` | — | `Q` |
| `score` | `f32`, `Q` | Shi–Tomasi minimum eigenvalue |
| `left`, `top` | `u16`, `Q` | Top-left pixel **in level coordinates** |
| `level` | `u8`, `Q` | |
| `pixels` | `u8`, `Q × P × P` | Row-major, `P × P` per patch |

Patch `q` contains exactly `level_image[level[q]][top[q] + i][left[q] + j]` for `i, j ∈ [0, P)`. Integer placement makes the stored pixels unambiguous.

Pixels are stored **without extra smoothing**: any blur is a tracker runtime parameter, not baked into the file. A file without `patches` is valid; the tracker then runs in detection-only mode (milestone M1).

### 5.8 `referenceImage` (optional)

```json
{ "level": 0, "width": 1024, "height": 768, "pixels": 10 }
```

`pixels` is a `u8` accessor of `width × height` grayscale values, row-major. `width` and `height` MUST equal `pyramid.levelSizes[level]`. The image is optional because of its size (a full-resolution 1024 × 768 target adds 768 KiB). It enables re-compilation, debugging and dense refinement, and possibly re-description on the runtime backend (open question Q4).

### 5.9 `info` (optional)

Free-form. Readers MUST NOT require any field. Suggested content:

```json
{
  "name": "pinball",
  "createdAt": "2026-09-10T12:00:00Z",
  "compiler": { "levels": 8, "maxKeypointsPerLevel": 260, "seed": 42 },
  "trackability": 0.82
}
```

## 6. Reader rules

### 6.1 Validation order

`.wnft` files may come from URLs chosen by an application's users, so the reader is exposed to untrusted input. It validates **in this order** and never allocates in proportion to a size before that size has been checked:

1. **Container.** Buffer ≥ 16 bytes; `magic`; `container_major` supported; `total_length` equals the buffer length; every chunk header and its padded data within bounds; `JSON` first and unique; `BIN\0` at most once and in second place.
2. **Checksums** of the `JSON` and `BIN\0` chunks.
3. **Manifest size.** `chunk_length` of `JSON` ≤ the manifest limit (§6.4) *before* decoding.
4. **Manifest decoding.** Strict UTF-8 (`new TextDecoder("utf-8", { fatal: true })`), then `JSON.parse` inside `try`/`catch`. Any failure — including a `RangeError` from pathological nesting — is `BAD_MANIFEST`. The top level MUST be an object.
5. **Format version and required extensions** (§7).
6. **Schema.** Required keys present with the right types; every accessor valid (§5.2) with the expected type and count; every count within the resource limits (§6.4).
7. **Data consistency.** `levelStart` monotonic and closed; `level` agreeing with `levelStart`; `kpIndex[i] < N`; `meta` equal to `levelSizes[0]`; `bytesPerDescriptor` consistent with `elementType` and `dimensions`; the multi-view rule (§5.6).

**Checked arithmetic.** Every product such as `count × size` is computed without overflow before it is compared with a length. In JS, products of two `u32` values are exact in `Number` (below `2^53`). In Rust, use `checked_mul` / `checked_add`, since a wrapped `u32` would pass the bounds check.

### 6.2 Error and warning codes

Readers return a result, never an exception, as ADR-0001 point 7 requires. Codes are shared by all implementations:

| Error | Condition |
|---|---|
| `BAD_MAGIC` | `magic` ≠ `"WKNF"` |
| `UNSUPPORTED_CONTAINER` | `container_major` unknown |
| `BAD_CONTAINER` | `total_length` mismatch, chunk out of bounds, `JSON` chunk missing or duplicated, `BIN\0` duplicated or out of place, non-zero reserved field |
| `CHECKSUM_MISMATCH` | A chunk's CRC-32 does not match |
| `MANIFEST_TOO_LARGE` | `JSON` chunk above the manifest limit |
| `BAD_MANIFEST` | Not strict UTF-8, not JSON, not an object, required key missing, wrong type |
| `UNSUPPORTED_FORMAT_VERSION` | `format.version` not supported (§7) |
| `UNSUPPORTED_EXTENSION` | A name in `extensionsRequired` the reader does not implement |
| `BAD_LAYOUT` | Accessor out of bounds, misaligned, overlapping, or with the wrong type or count |
| `LIMIT_EXCEEDED` | A count or size above the resource limits (§6.4) |
| `INCONSISTENT_DATA` | Any rule of step 7 violated; duplicate descriptor-set key |
| `NO_USABLE_DESCRIPTORS` | No descriptor set usable by the backend (§6.3) |

| Warning | Condition |
|---|---|
| `UNKNOWN_CHUNK_SKIPPED` | A chunk with an unknown type |
| `UNSUPPORTED_DESCRIPTOR_SET` | A set with an unknown `kind`, `norm` or `elementType`, skipped |
| `PRODUCER_MISMATCH` | The chosen set's `producer` ≠ the runtime backend's `capabilities.name` |

Warnings MUST be part of the returned result, not only logged to the console, so an application can act on them. `PRODUCER_MISMATCH` stays a warning until cross-backend descriptor conformance is established (ADR-0001, contract gaps).

### 6.3 Choosing a descriptor set

The application's preference order is intersected with the backend's capabilities, following the pattern documented in the contract. No silent substitution:

```ts
const preferred: DescriptorKind[] = ["teblid", "freak", "orb"];
const usable = file.descriptorSets.filter((s) => cv.capabilities.descriptors.includes(s.kind));
const chosen = preferred.map((k) => usable.find((s) => s.kind === k)).find(Boolean);
if (!chosen) return { ok: false, error: "NO_USABLE_DESCRIPTORS" };
```

**Keypoints and foreign backends.** Readers and trackers MUST NOT pass stored keypoints to a backend's `describe` unless that backend's pyramid scale step is known to equal `pyramid.scaleStep`. Otherwise `describe` silently computes descriptors at the wrong scale. The contract does not expose the step yet, so today this means: never re-describe stored keypoints on a different backend.

### 6.4 Resource limits

Readers MUST enforce configurable limits and report `LIMIT_EXCEEDED` (or `MANIFEST_TOO_LARGE`) when they are exceeded. Suggested defaults:

| Limit | Default |
|---|---|
| File size | 64 MiB |
| Manifest (`JSON` chunk) | 1 MiB |
| Pyramid levels | 32 |
| Keypoints per file | 1,000,000 |
| Descriptor sets per file | 16 |
| Patch size `P` | 64 |

## 7. Versioning and evolution

### 7.1 Three layers

| Layer | Where | Governs | Reader rule |
|---|---|---|---|
| **Container** | `container_major.minor` in the binary header | Framing: header, chunks, padding, checksum | Unknown major → `UNSUPPORTED_CONTAINER`, before reading anything else. A newer minor is accepted: container minors only add things readers can skip, such as new chunk types |
| **Format** | `format.version` in the manifest | Meaning of the manifest and the arrays | While the major is `0`: only exactly the supported `major.minor`. From `1.0`: same major, any minor |
| **Extensions** | `extensionsUsed` / `extensionsRequired` | Optional features | Unknown and required → `UNSUPPORTED_EXTENSION`. Unknown and only used → ignored |

The same model is used by glTF 2.0: the GLB container has its own version number, and the JSON carries `asset.version`.

The "exact minor" rule for `0.x` exists because, during the draft, each minor may break the one before. Without it, a `0.1` reader would accept a `0.3` file and silently misread it.

### 7.2 How to change the format

| Change | How | Version effect |
|---|---|---|
| New descriptor family (FREAK, TEBLID, …) | A new `descriptorSets` entry with a new `kind` | **None.** Old readers skip the set with a warning |
| New parameter of a family | A key in `params` | None |
| New optional field or array | A new manifest key, plus an accessor if it is an array | Minor |
| Feature that old readers must not ignore (e.g. multi-view) | An extension listed in `extensionsRequired` | None, or minor when it enters the core |
| Changed meaning of an existing field | Forbidden within a major: use a new key or an extension | Major |
| Change to the container | New container minor (additive) or major | Container |

### 7.3 Canonical writer

The same content always produces the same bytes from the same implementation:
- Chunks in the order `JSON`, `BIN\0`; no other chunks.
- Manifest keys in the order this specification lists them; no insignificant whitespace; `descriptorSets` sorted by `kind`, `norm`, `dimensions`, `producer`.
- Accessors in the order their fields first appear in the manifest, each starting at a multiple of 8, with zero padding in between.
- `extensionsUsed` and `extensionsRequired` sorted, omitted when empty.

JSON serializers in different languages may format the same number differently (for example `0.000001` versus `1e-6`). For that reason cross-implementation conformance compares manifests **after parsing**, and requires byte identity only for the `BIN\0` chunk (§8.2, open question Q8).

## 8. Conformance and testing

### 8.1 Fixtures

Fixtures live in a directory shared by `vitest` and `cargo test` (e.g. `fixtures/nft-target/0.1/`). They are produced by a committed, deterministic generator script and never edited by hand:

- `valid/minimal.wnft` — a tiny synthetic target (e.g. 64×48, 2 levels, ~20 keypoints, one `orb` set, `patches`), with `valid/minimal.json` holding its decoded values (manifest plus arrays as JSON lists).
- `valid/` — further valid files: several descriptor sets, `L = 1`, zero keypoints, no `patches`, unaligned-base variant (§3).
- `invalid/` — at least one file per error code in §6.2, each paired with its expected code.
- `warnings/` — files that decode successfully with an exact list of expected warnings: unknown chunk, unknown descriptor `kind` next to a valid set, unknown `norm`, unknown optional extension.

### 8.2 Required tests (every implementation)

1. `decode(valid/minimal.wnft)` equals `valid/minimal.json`.
2. **Same-implementation round trip:** `encode(decode(f))` is byte-identical to `f` for every valid fixture.
3. **Cross-implementation:** `BIN\0` chunks byte-identical; manifests equal after parsing.
4. Every `invalid/` file yields exactly its expected error code; every `warnings/` file yields `ok` with exactly its expected warnings.
5. CRC-32 test vector: `123456789` → `0xCBF43926`.

### 8.3 Evolution tests

- A file declaring format `0.2` is rejected by a `0.1` reader with `UNSUPPORTED_FORMAT_VERSION`.
- Unknown keys at the top level, inside a descriptor set and inside `params` are ignored.
- An unknown extension in `extensionsRequired` → `UNSUPPORTED_EXTENSION`; the same extension only in `extensionsUsed` → ignored.
- A file with two descriptor sets, one of an unknown family: the other remains usable.
- `M ≠ N` without `WKNF_multiview` in `extensionsRequired` → `INCONSISTENT_DATA`.
- **Backward-compatibility corpus.** Every released format version freezes its fixtures under `fixtures/nft-target/<version>/`. From then on, every reader either decodes them correctly or rejects them with an explicit error — never misreads them.

### 8.4 Robustness tests (untrusted input)

- **Truncation:** every valid fixture, truncated at every byte offset, yields `ok: false` and never throws.
- **Property-based fuzzing** (`fast-check` in TS; `cargo-fuzz` in Rust): random bit flips and random counts, offsets and lengths. The reader never throws, always terminates and never allocates beyond the limits.
- **Size arithmetic:** counts chosen so that `count × size` overflows `u32` or exceeds the chunk → `BAD_LAYOUT` or `LIMIT_EXCEEDED`, with no allocation.
- **Manifest attacks:** a manifest one byte above the limit → `MANIFEST_TOO_LARGE`; deeply nested JSON, invalid UTF-8 → `BAD_MANIFEST`.
- **Property-based round trip:** a random valid `TargetDb`, encoded then decoded, equals the original.

## 9. Size estimate

For 1,000 keypoints over 8 levels, one 256-bit ORB set, 50 patches of 8×8, and no `referenceImage`:

| Part | Bytes |
|---|---|
| File header + 2 chunk headers | 48 |
| Manifest | ~1.5 KB |
| Keypoint arrays (21 B per keypoint) | ~21 KB |
| Descriptor set (32 B data + 4 B `kpIndex` per row) | ~36 KB |
| Patches (73 B per patch) | ~3.7 KB |
| **Total** | **≈ 63 KB** |

## 10. Decisions

Decisions D1–D5 below are accepted as part of this specification.

- **D1 — Model-plane origin:** level-0 pixel `(0, 0)`, top-left, `+Y` down. Centring is an option of the tracker API, never stored in the file. *(was Q1)*
- **D2 — Half-pixel convention:** `x0 = x_l / s_l` without correction, as OpenCV ORB and `cv-backend-jsfeatnext`. The resulting bias (~2 px at level 7 with the `∛2` step) is smaller than the localisation uncertainty of a keypoint at that level (~5 px in level-0 pixels). *(was Q2)*
- **D3 — Integrity:** CRC-32 per chunk in the container (§4.2). *(was Q5)*
- **D4 — Extension:** `.wnft`. *(was Q7)*
- **D5 — Structure:** a binary container with a JSON manifest and a binary data chunk, following glTF's GLB (§2).

## 11. Open questions

- **Q3 — Multi-view descriptors.** The format side is settled (`WKNF_multiview`, §5.6). Adoption is blocked on k-nearest matching in the contract.
- **Q4 — Producer mismatch strategy.** Warn only (v0.1), or store a full-resolution `referenceImage` and re-describe on the runtime backend when its scale step matches. The second avoids bit incompatibility but costs about 1 byte per pixel.
- **Q6 — Multiple targets.** v0.1 stores one target per file; a container of targets or a manifest of files could come later.
- **Q8 — Canonical JSON numbers across languages.** Defining a strict number grammar for the manifest would give byte identity of the whole file across implementations, not only of the `BIN\0` chunk. It is probably not worth the complexity; to be revisited if the cross-implementation tests turn out to need it.
- **Q9 — Media type** for serving `.wnft` (e.g. a vendor type such as `application/vnd.webarkit.nft-target`).
