# NFT target format — v0.2

**Status:** Accepted (format 0.2). The format version is `0.2`: while the major is `0`, every minor may break compatibility (§7).
**Decided by:** [ADR-0001](../adr/0001-nft-tracker-ts-reference-above-cvbackend.md), point 6.
**Implementations (both planned, neither exists yet):** `packages/nft-tracker/src/target/format` (TypeScript, which will also host the fixture generator) and `crates/wnft-format` (Rust, see [ADR-0001](../adr/0001-nft-tracker-ts-reference-above-cvbackend.md) point 6). The TypeScript codec is required by the tracker; the Rust codec exists to validate this specification and is not part of the tracker port of ADR-0001 point 5. The two are peers: this specification is the source of truth, and a second independent implementation is what exposes its ambiguities.

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

- **Adding something never shifts existing bytes.** A new field is a new manifest key; a new array is a new accessor. Old readers ignore both (§7) — but only from format `1.0` on. While the major is `0`, a reader accepts nothing but its own exact minor and rejects every other one (§7.1), so additive changes are not yet forward-compatible in practice.
- **Versioning happens at two layers, and each version governs only its own layer** (§7). This is not duplication: a reader must be able to reject a container it cannot frame *before* it looks for the manifest, and it can only read the format version *after* framing.

## 3. Conventions

**Byte order.** All multi-byte values are little-endian. Every platform WebARKit targets is little-endian, so readers MAY view arrays directly. TS readers SHOULD assert this once at load time:

```ts
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
```

**Alignment.** Chunk data starts at a file offset that is a multiple of 8, and every accessor's offset is a multiple of its element size (the canonical writer uses 8). All padding is defined in §4.

When a file is not at an 8-aligned address — for example, a `.wnft` stored inside a larger `ArrayBuffer`, or embedded with Rust `include_bytes!`, which only guarantees 1-byte alignment — views may be impossible. JS typed arrays require the byte offset to be a multiple of the element size. Readers MUST detect this and fall back to copying the affected arrays. They MUST NOT read misaligned data through a view.

A reader therefore MUST accept a buffer that is not the whole allocation: in TypeScript an `ArrayBufferView`, whose `byteOffset` carries the base, alongside a bare `ArrayBuffer`. Without that the fallback is unreachable from JavaScript — an `ArrayBuffer` always starts at offset `0` — and so untestable.

**Pixel coordinates.** Integer coordinates are pixel centres, so a FAST corner at column 10 has `x = 10`. All **keypoint** positions are stored in **level-0 coordinates**, i.e. pixels of the full-resolution reference image; the level a keypoint came from is recorded separately in `keypoints.level`.

**Patch positions are the one exception.** `patches.left` and `patches.top` are integer coordinates of the patch's own level, not level-0 (§5.7), because the stored pixels are read from that level's image at exactly those indices; storing them in level-0 coordinates would reintroduce a rounding step and make the stored pixels ambiguous. Convert to level-0 with the mapping below, using `patches.level` as `l`.

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
- `BIN\0`, if present, MUST be the second chunk. There is at most one. It MUST be present if the manifest declares any accessor (§5.2).
- A chunk of an unknown type is ignored by readers (warning `UNKNOWN_CHUNK_SKIPPED`). It may sit in second place only when the file has no `BIN\0` chunk. This leaves room for future container minors.

**Checksum.** `crc32` is CRC-32/ISO-HDLC — polynomial `0x04C11DB7` (reflected `0xEDB88320`), initial value and final XOR `0xFFFFFFFF` — the same as zlib, PNG and Rust's `crc32fast`. Test vector: the ASCII bytes `123456789` give `0xCBF43926`.

CRC-32 detects **accidental** corruption: a truncated or damaged download, a broken cache entry, a bad copy. It does not detect deliberate tampering, because anyone who modifies the data can recompute it. Protection against tampering comes from the transport (HTTPS, Subresource Integrity), not from this format.

## 5. Manifest

The `JSON` chunk holds one JSON object: UTF-8, no BOM.

**The manifest MUST be I-JSON** ([RFC 7493](https://www.rfc-editor.org/rfc/rfc7493)). Plain JSON leaves enough freedom that two conforming decoders can read the same untrusted file differently — `JSON.parse` keeps the last of a set of duplicate keys, other parsers keep the first or error — and a file format whose whole point is that it "MUST decode to the same values in any other implementation" (§1) cannot afford that. Readers MUST reject with `BAD_MANIFEST`:

- **(a) Duplicate member names in any object**, compared after unescaping: `"a"` and `"\u0061"` are the same name and therefore duplicates. This applies at every level, `params` and `info` included.
- **(b) Strings containing an unpaired surrogate**, written as an escape (`"\uD800"`). Such a string has no well-defined transcoding, so implementations in different languages would not agree on its value. A surrogate encoded raw in the UTF-8 bytes needs no check here: the strict UTF-8 decoding at the start of §6.1 step 4 has already rejected it, so (b) only concerns `\u` escapes.
- **(c) Integer literals — no fraction, no exponent — outside ±(2^53 − 1)**, the range in which an IEEE 754 double represents every integer exactly. Outside it, `9007199254740993` and `9007199254740992` are the same double in one implementation and two distinct integers in another.
- **(d) Number literals whose nearest IEEE 754 double is infinite** (e.g. `1e400`). `JSON.parse` turns them into `Infinity` while other parsers reject them. Literals that round to zero (e.g. `1e-400`) are fine: every implementation reads `0`.
- **(e) Strings containing a Unicode noncharacter**, in member names as well as values, as [RFC 7493 §2.1](https://www.rfc-editor.org/rfc/rfc7493#section-2.1) requires. These are the 66 code points U+FDD0..U+FDEF and U+FFFE, U+FFFF at the end of every plane (U+1FFFE, U+1FFFF, … U+10FFFE, U+10FFFF). They are permanently reserved for internal use, so what a string library does with one is its own business, not something two implementations agree on. Unlike a surrogate, a noncharacter is **well-formed UTF-8** and passes the strict decoding of §6.1 step 4, so (e) applies to raw text just as much as to `\u` escapes.

Non-integer numbers (anything written with a fraction or an exponent) are **read as the nearest finite IEEE 754 double**: they are approximations by nature, and every field of this specification that requires exactness already requires an integer (§5.2, §5.4). Their magnitude is otherwise unchecked — (d) is the only bound, and it exists because infinity is not a value this format can carry.

Key uniqueness is the one check the canonical writer (§7.3) satisfies **by construction** — it emits each key once and sorts the keys of `params` and `info`, so a duplicate can only come from a hand-made or hostile file. That is only one of the writer's guarantees, and construction alone does not cover the other four: `params` and `info` carry values the writer did not choose. §7.3 therefore requires the writer to validate before it serializes.

### 5.1 Top level

```json
{
  "format": { "version": "0.2", "generator": "@webarkit/nft-tracker 0.1.0" },
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

**Unknown keys.** Readers MUST ignore keys they do not know, at every level, and MUST NOT re-emit them (§7.3). Writers MUST NOT use a new key to change the meaning of existing data (§7).

**The exception is `params` and `info`.** Those two objects are specified to carry arbitrary content (§5.5, §5.6, §5.9), so their keys are never "unknown": a reader preserves them as-is and round-trips them unchanged. The rule above applies to keys *beside* them, not to keys *inside* them.

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
- `offset` and `count` MUST each be a JSON number with no fractional part, in `[0, 2^32 − 1]`. `NaN`, `Infinity`, negative and fractional values are `BAD_MANIFEST`, rejected **before** any arithmetic uses them, so that the checked arithmetic of §6.1 always operates on `u32` operands.
- Every manifest field that references an accessor MUST be an integer in `[0, accessors.length)`. Anything else — a fractional index, a negative one, one past the end, or a non-number — is `BAD_MANIFEST`.
- `offset + count × size(type)` MUST be `≤` the `BIN` chunk length, computed with checked arithmetic (§6.1).
- Accessors MUST NOT overlap. Each array owns its bytes.
- Every field that references an accessor fixes the expected `type` and `count`. A mismatch is `BAD_LAYOUT`.
- Accessors that no known field references are allowed and ignored; they may belong to an extension.
- A file whose manifest declares at least one accessor and which has no `BIN\0` chunk is `BAD_LAYOUT`. The bound above treats an absent `BIN\0` as a chunk of length `0`, which already rejects every accessor with `count > 0`; this rule also covers the manifest whose accessors all have `count = 0`. The check belongs here, not to §6.1 step 1: a reader cannot know whether accessors exist until the manifest is parsed.

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
- Every width and height in `levelSizes` MUST be a JSON number with no fractional part, in `[1, 2^16 − 1]`, and `scaleStep` MUST be finite and `> 1`. A violation of either is `BAD_MANIFEST`: a zero or negative size, or a `scaleStep` of `1` or less, makes the level mapping of §3 meaningless or a division by zero.
- `levelSizes` MUST be non-increasing: for every `l`, `levelSizes[l+1][0] ≤ levelSizes[l][0]` and `levelSizes[l+1][1] ≤ levelSizes[l][1]`. A violation is `INCONSISTENT_DATA`.

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
| `detector` | — | `kind` (a `DetectorKind` string) and free-form `params`, which is optional — an absent `params` is equivalent to `{}` (§7.3). Informative, except where a descriptor's parameters depend on the detector (§5.6). Any string is a legal `kind`, including the empty one and one the reader does not know: it is informative, so a reader MUST NOT constrain it further, and a writer MUST NOT refuse a target because of it |
| `levelStart` | `u32`, `L + 1` | Keypoints of level `l` are the indices `[levelStart[l], levelStart[l+1])`; `levelStart[0] = 0`, `levelStart[L] = N`, and `levelStart` is non-decreasing |
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
| `dimensions` | Number of bits for `"bits"`, number of elements otherwise. No minimum is imposed: `0` is legal, and describes a set whose descriptors carry nothing, which `bytesPerDescriptor: 0` must then match. Readers and writers MUST agree on this — a file one accepts and the other cannot re-emit breaks the round trip of §8.2 item 2 |
| `bytesPerDescriptor` | MUST equal `dimensions / 8` for `"bits"` (`dimensions` a multiple of 8), `dimensions` for `"u8"`, `4 × dimensions` for `"f32"` |
| `producer` | `capabilities.name` of the backend that computed the set, e.g. `"jsfeatnext"` |
| `params` | Free-form, family-specific parameters, e.g. `{ "wtaK": 2 }` for ORB, `{ "scaleFactor": 1.0 }` for TEBLID. Optional: an absent `params` is equivalent to `{}`, and the canonical writer omits it when empty (§7.3) |
| `count` | Rows `M` |
| `levelStart` | `u32` accessor, `L + 1` entries: row ranges per level |
| `kpIndex` | `u32` accessor, `M` entries: the keypoint each row describes |
| `data` | Accessor with `type` `"u8"` for `"bits"` and `"u8"`, `"f32"` for `"f32"`; `count` = `M × bytesPerDescriptor` for `"u8"`, `M × dimensions` for `"f32"` |

**`params` is data, not unknown keys.** The same holds for `info` (§5.9). Their contents are free-form *by design*, so a reader preserves them as-is and round-trips them unchanged — which is exactly what §7.3 does not promise for unrecognised keys elsewhere. These two objects are specified to carry arbitrary content, so carrying it *is* understanding it.

**Several sets, and what they are for.** A file MAY contain several sets. For example, `orb` and `teblid` let one file serve backends with different capabilities (§6.3). Two `orb` sets from different producers work around the "same kind, different bits" problem (ADR-0001, contract gaps). Uniqueness is on the key (`kind`, `norm`, `dimensions`, `producer`): two sets with the same key are `INCONSISTENT_DATA`.

**Unknown families don't break the file.** A set whose `kind`, `norm` or `elementType` the reader does not know becomes unusable, with the warning `UNSUPPORTED_DESCRIPTOR_SET`. The rest of the file stays readable. Only a *structurally* broken set (an accessor out of bounds, `levelStart` inconsistent) makes the whole file invalid.

Unusable does not mean handled identically, because `elementType` is what says how to read the bytes:

- **Unknown `kind` or `norm`, known `elementType`.** The set is structurally understood — the reader knows the element width, the row count and which keypoint each row describes — so it is **preserved** and re-emitted unchanged. It stays unusable and still warns.
- **Unknown `elementType`.** Nothing says how wide an element is or which accessor type to expect, so the set cannot be interpreted at all. It is **dropped on decode**, with the same warning, and does not reappear on encode — §7.3's rule, applied to a descriptor set.

**A file whose every set is dropped still decodes.** The decoded target then carries no descriptor set: §5.1's "at least one entry" is a rule about the file, which that file satisfies, not about the decoded target. Two consequences follow and are deliberate. Such a target is not re-encodable — the canonical writer returns `INVALID_TARGET` (§7.3), because the file it would have to emit is one §5.1 forbids. And choosing a set on it (§6.3) yields `NO_USABLE_DESCRIPTORS`, which is exactly what that error means.

**Level ranges MUST be closed and agree with the keypoints.** For every set: `levelStart[0] = 0`, `levelStart[L] = M`, `levelStart` is non-decreasing, and every `kpIndex[i]` with `i ∈ [levelStart[l], levelStart[l+1])` MUST reference a keypoint whose `level` is `l`. Without the last rule a row could be matched at one level and then mapped onto a keypoint from another, silently corrupting the per-level correspondences that the view below produces. Any violation is `INCONSISTENT_DATA`.

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

Patch `q` contains exactly `level_image[level[q]][top[q] + i][left[q] + j]` for `i, j ∈ [0, P)`. Integer placement makes the stored pixels unambiguous. These are the only positions in the file that are **not** in level-0 coordinates (§3); readers converting a patch to the model plane MUST map through `level[q]` first.

Every patch MUST be in bounds: `level[q] < L`, `left[q] + P ≤ levelSizes[level[q]][0]` and `top[q] + P ≤ levelSizes[level[q]][1]`. A violation is `INCONSISTENT_DATA`, checked before any pixel is read.

Pixels are stored **without extra smoothing**: any blur is a tracker runtime parameter, not baked into the file. A file without `patches` is valid; the tracker then runs in detection-only mode (milestone M1).

### 5.8 `referenceImage` (optional)

```json
{ "level": 0, "width": 1024, "height": 768, "pixels": 10 }
```

`pixels` is a `u8` accessor of `width × height` grayscale values, row-major. `level` MUST be `< L`, checked **before** `levelSizes[level]` is indexed, and `width` and `height` MUST then equal `pyramid.levelSizes[level]`. A violation of either is `INCONSISTENT_DATA`. The image is optional because of its size (a full-resolution 1024 × 768 target adds 768 KiB). It enables re-compilation, debugging and dense refinement, and possibly re-description on the runtime backend (open question Q4).

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

0. **File size.** The buffer is at most the file-size limit (§6.4), checked before a single byte is read: `LIMIT_EXCEEDED`. It is numbered `0` rather than folded into step 1 because it precedes even the magic — a buffer past the limit is rejected without being inspected, so a very large file that is not a `.wnft` at all reports `LIMIT_EXCEEDED`, not `BAD_MAGIC`. Any other order would have the reader checksum a file whose size it has not yet accepted, which is the cost the paragraph above exists to avoid.
1. **Container.** Buffer ≥ 16 bytes; `magic`; `container_major` supported; `total_length` equals the buffer length; every chunk header and its padded data within bounds; `JSON` first and unique; `BIN\0` at most once and in second place.
2. **Checksums** of the `JSON` and `BIN\0` chunks.
3. **Manifest size.** `chunk_length` of `JSON` ≤ the manifest limit (§6.4) *before* decoding.
4. **Manifest decoding.** Strict UTF-8 (`new TextDecoder("utf-8", { fatal: true })`), then the five I-JSON checks of §5 — duplicate member names, unpaired surrogate escapes, integer literals outside ±(2^53 − 1), number literals rounding to infinity, noncharacters in strings — **on the manifest text, before `JSON.parse`**, then `JSON.parse` inside `try`/`catch`. Any failure — including a `RangeError` from pathological nesting — is `BAD_MANIFEST`. The top level MUST be an object.

   For **(a)** and **(c)** the order is forced: neither can be done after parsing. A duplicate member name is gone — the parser kept one of the two and nothing records that there was another — and an out-of-range integer literal has already been rounded, so `9007199254740993` is `9007199254740992` by the time it is a value.

   **(b)**, **(d)** and **(e)** could be done after parsing instead, by walking the decoded value (`String.prototype.isWellFormed()`, `Number.isFinite()`, a scan for noncharacters): a lone surrogate, an `Infinity` and a noncharacter all survive into the result unchanged. Doing all five in the one pass over the text is simply simpler than parsing and then walking the tree a second time.

   > **TypeScript implementers.** A single tokenizing pass over the manifest text does all five: it is the only pass that sees member names before they are deduplicated, string escapes before they are combined, and number literals before they become `Number`s.
   >
   > **Rust implementers.** Enable `serde_json`'s `float_roundtrip` feature. Verify duplicate-key rejection **explicitly, with a test**, rather than relying on serde's defaults: what a derived `Deserialize` does with a repeated field is a property of the derive, not a guarantee of the format.
5. **Format version and required extensions** (§7).
6. **Schema.** Required keys present with the right types; every accessor valid (§5.2), including the `[0, 2^32 − 1]` integer domains of `offset` and `count` and every accessor reference being an integer index in `[0, accessors.length)`, with the expected type and count; the pyramid domains of §5.4 (every `levelSizes` entry an integer in `[1, 2^16 − 1]`, `scaleStep` finite and `> 1`); every count within the resource limits (§6.4). Type and domain violations at this step are `BAD_MANIFEST`, and they are checked before any value reaches the arithmetic below.
7. **Data consistency.** `levelStart` monotonic and closed; `level` agreeing with `levelStart`; `kpIndex[i] < N`; `meta` equal to `levelSizes[0]`; `bytesPerDescriptor` consistent with `elementType` and `dimensions`; the multi-view rule (§5.6). Also:
   - `levelSizes` non-increasing from level to level (§5.4).
   - For every descriptor set, `levelStart[0] = 0`, `levelStart[L] = M`, and every `kpIndex` inside the range of level `l` referencing a keypoint whose `level` is `l` (§5.6).
   - For every patch, `level[q] < L`, `left[q] + P ≤ levelSizes[level[q]][0]` and `top[q] + P ≤ levelSizes[level[q]][1]` (§5.7).
   - `referenceImage.level < L`, checked before its `width` and `height` are compared with `levelSizes[level]` (§5.8).

**Checked arithmetic.** Every product such as `count × size` is computed without overflow before it is compared with a length. In JS, products of two `u32` values are exact in `Number` (below `2^53`). In Rust, use `checked_mul` / `checked_add`, since a wrapped `u32` would pass the bounds check.

### 6.2 Error and warning codes

Readers return a result, never an exception, as ADR-0001 point 7 requires. Codes are shared by all implementations. (The writer has one error of its own, `INVALID_TARGET`, defined in §7.3.)

| Error | Condition |
|---|---|
| `BAD_MAGIC` | `magic` ≠ `"WKNF"` |
| `UNSUPPORTED_CONTAINER` | `container_major` unknown |
| `BAD_CONTAINER` | `total_length` mismatch, chunk out of bounds, `JSON` chunk missing or duplicated, `BIN\0` duplicated or out of place, non-zero reserved field |
| `CHECKSUM_MISMATCH` | A chunk's CRC-32 does not match |
| `MANIFEST_TOO_LARGE` | `JSON` chunk above the manifest limit |
| `BAD_MANIFEST` | Not strict UTF-8, not JSON, not I-JSON (§5), not an object, required key missing, wrong type |
| `UNSUPPORTED_FORMAT_VERSION` | `format.version` not supported (§7) |
| `UNSUPPORTED_EXTENSION` | A name in `extensionsRequired` the reader does not implement |
| `BAD_LAYOUT` | Accessor out of bounds, misaligned, overlapping, or with the wrong type or count |
| `LIMIT_EXCEEDED` | A count or size above the resource limits (§6.4) |
| `INCONSISTENT_DATA` | Any rule of step 7 violated; duplicate descriptor-set key |
| `NO_USABLE_DESCRIPTORS` | No descriptor set usable by the backend (§6.3) |

| Warning | Condition |
|---|---|
| `UNKNOWN_CHUNK_SKIPPED` | A chunk with an unknown type |
| `UNKNOWN_EXTENSION_IGNORED` | A name in `extensionsUsed` but not in `extensionsRequired` that the reader does not implement. Its payloads are ignored and the name is pruned from the decoded `extensionsUsed` (§7.3) |
| `UNSUPPORTED_DESCRIPTOR_SET` | A set with an unknown `kind`, `norm` or `elementType`, or one the runtime backend cannot consume (§6.3), skipped |
| `PRODUCER_MISMATCH` | The chosen set's `producer` ≠ the runtime backend's `capabilities.name` |

Warnings MUST be part of the returned result, not only logged to the console, so an application can act on them. `PRODUCER_MISMATCH` stays a warning until cross-backend descriptor conformance is established (ADR-0001, contract gaps).

### 6.3 Choosing a descriptor set

The application's preference order is intersected with the backend's capabilities, following the pattern documented in the contract. No silent substitution.

A matching `kind` is **not** sufficient. This file format can store `elementType` `"u8"` and `"f32"` sets and any `norm`, while the contract represents descriptors as a `Uint8Array` and every `DescriptorKind` it defines today is binary. A set is therefore usable only if all three hold:

- `elementType` is `"bits"`,
- `norm` is `"hamming"`, and
- `kind` is listed in `capabilities.descriptors`.

```ts
const preferred: DescriptorKind[] = ["teblid", "freak", "orb"];

const usable = file.descriptorSets.filter(
    (s) =>
        s.elementType === "bits" &&           // Descriptors.data is a Uint8Array
        s.norm === "hamming" &&               // every current DescriptorKind is binary
        cv.capabilities.descriptors.includes(s.kind),
);
const chosen = preferred.map((k) => usable.find((s) => s.kind === k)).find(Boolean);
if (!chosen) return { ok: false, error: "NO_USABLE_DESCRIPTORS" };
```

**The width must match too.** Two backends can both declare the same `kind` and still produce descriptors of a different size, and `match` cannot compare rows of different widths. Before using a set, the tracker MUST describe a probe on the runtime backend and compare. The probe MUST request the set's own size through `DescribeOptions.bits` — for a `"bits"` set that is `dimensions` — so that a 512-bit set is not rejected merely because the backend's default for that family is 256:

```ts
const probe = cv.describe(probeImage, probeKeypoints, {
    kind: chosen.kind,
    bits: chosen.dimensions,        // ignored by fixed-size families
});
if (probe.bytesPerDescriptor !== chosen.bytesPerDescriptor || probe.norm !== chosen.norm) {
    // unusable: warn UNSUPPORTED_DESCRIPTOR_SET and fall through to the next candidate
}
```

The probe checks descriptor **shape**, not bit compatibility: two backends producing the same `kind` at the same size can still compute different bits, and only `PRODUCER_MISMATCH` covers that.

A set failing any of these checks is unusable: the reader reports the warning `UNSUPPORTED_DESCRIPTOR_SET` and moves on to the next candidate. When no set survives, the result is the error `NO_USABLE_DESCRIPTORS`. This does not cover *bit* compatibility between two backends declaring the same `kind` — that gap is `PRODUCER_MISMATCH` and ADR-0001's contract gaps.

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
| Patches per file `Q` | 65,536 |

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

**While the major is `0`, every "Minor" row above means old readers reject the file**, not that they ignore the addition: §7.1 requires an exact minor match during `0.x`. The additive forward compatibility that §2 describes begins at `1.0`.

### 7.3 Canonical writer

The same content always produces the same bytes from the same implementation:
- Chunks in the order `JSON`, `BIN\0`; no other chunks.
- Manifest keys in the order this specification lists them; no insignificant whitespace; `descriptorSets` sorted by `kind`, `norm`, `dimensions`, `producer`.
- Accessors in the order their fields first appear in the manifest, each starting at a multiple of 8, with zero padding in between.
- `extensionsUsed` and `extensionsRequired` sorted, omitted when empty.
- Inside `params` and `info`, object keys sorted by **Unicode code point**, recursively. Their content is arbitrary, so it has no specified key order of its own; sorting is what makes the round trip byte-identical.

  > **TypeScript implementers.** `JSON.stringify` does not produce this order. JavaScript objects enumerate integer-like keys numerically and first, so `{"10":a,"9":b}` serializes as `"9"` before `"10"`, whereas code-point order puts `"10"` first. These two objects MUST therefore be serialized explicitly, not handed to `JSON.stringify`.

**The writer MUST NOT emit a file that a conforming reader would reject.** Before serializing, it validates the whole target against this specification — every I-JSON check of §5 on the free-form content of `params` and `info`, and every domain and consistency rule of §5 and §6 on the rest — and on failure returns an error instead of emitting bytes.

In particular the writer **MUST NOT coerce values** to make them serializable. `JSON.stringify` turns `NaN` and `Infinity` into `null`, so a target carrying either would encode to a file that decodes cleanly with the value silently changed — the one outcome worse than a rejected write.

**On check (c), the writer is deliberately stricter than the reader.** Check (c) constrains integer *literals*, so a reader accepts `1e+21`: it carries an exponent and is therefore not an integer literal at all. A writer MUST nonetheless refuse any integer-valued number outside ±(2^53 − 1) in `params` or `info`, whatever its own serializer would emit for it. The reason is Q8: number formatting is not fixed across languages, so a second implementation may well write that same value as `1000000000000000000000` — which *is* an integer literal outside the range, and which every conforming reader rejects. A target that one implementation can write and another cannot is exactly what §1 exists to prevent, and the cost of the stricter rule is nil: no real target carries an integer that large.

The writer's result mirrors the reader's:

```ts
type EncodeResult =
    | { ok: true; bytes: Uint8Array }
    | { ok: false; error: "INVALID_TARGET"; detail: string };
```

`detail` names the offending field path, e.g. `"descriptorSets[1].params.seed"`, so the caller can find the value without re-validating the target itself.

**A decoder keeps only what it understands, and the canonical writer emits only that.** Unknown keys, and unknown non-required extensions with their payloads, are ignored on decode and not preserved on encode: an implementation cannot keep data it does not understand consistent, for example when accessors are renumbered.

When an unknown non-required extension is ignored, **its name is also removed from `extensionsUsed`**. The decoded `extensionsUsed` therefore lists only extensions the implementation understands, and re-encoding does not advertise a payload that is no longer there. (`extensionsRequired` needs no such rule: an unknown name there is `UNSUPPORTED_EXTENSION` and the file never decodes at all, §6.1 step 5.)

**Optional objects and arrays that are empty** (`params`, `extensionsUsed`, `extensionsRequired`) are omitted by the canonical writer; readers treat an absent one as empty.

JSON serializers in different languages may format the same number differently (for example `0.000001` versus `1e-6`). For that reason cross-implementation conformance compares manifests **after parsing**, and requires byte identity only for the `BIN\0` chunk (§8.2, open question Q8).

## 8. Conformance and testing

### 8.1 Fixtures

Fixtures live in a directory shared by `vitest` and `cargo test` (e.g. `fixtures/nft-target/0.2/`). They are produced by a committed, deterministic generator script and never edited by hand:

- `valid/minimal.wnft` — a tiny synthetic target (e.g. 64×48, 2 levels, ~20 keypoints, one `orb` set, `patches`), with `valid/minimal.json` holding its decoded values (manifest plus arrays as JSON lists).
- `valid/` — further valid files: several descriptor sets, `L = 1`, zero keypoints, no `patches`, and a **boundary** file whose `params` carries the integer literal `9007199254740991` (`2^53 − 1`), which must decode: it catches an off-by-one in check (c) of §5. The unaligned base of §3 is **not** a fixture: a file's bytes cannot be misaligned, only its address can. It is exercised by decoding an existing `valid/` fixture copied to a non-8-aligned `byteOffset` inside a larger buffer.
- `invalid/` — at least one file per error code in §6.2, each paired with its expected code, **plus one file per validation rule of §§5.2, 5.4, 5.6, 5.7 and 5.8**: a fractional `offset`; a negative `count`; a `count` above `2^32 − 1`; an accessor reference that is not an integer index below `accessors.length`; a level size of `0`; a level size above `2^16 − 1`; a `scaleStep` of `1`; `levelSizes` growing between two levels; a set with `levelStart[0] ≠ 0`; a set with `levelStart[L] ≠ M`; a `kpIndex` referencing a keypoint of another level; a patch whose `level[q] ≥ L`; a patch rectangle crossing the right or bottom edge of its level; a `referenceImage.level ≥ L`. **Plus one file per I-JSON check of §5**: a manifest with a duplicate member name; one with the same name written twice in different ways (`"a"` and `"\u0061"`), which catches an implementation that compared the raw text instead of the unescaped names; one with an unpaired surrogate escape in a string; one whose `params` carries the integer literal `9007199254740992` (`2^53`); one whose `params` carries `1e400`, which rounds to infinity; one with a **raw** U+FFFF in a `params` value, which strict UTF-8 decoding accepts and only check (e) catches; one with an escaped `"\uFDD0"` in a member name. `NO_USABLE_DESCRIPTORS` is the one exception to "one file per error code": it is produced by the descriptor-set selection of \u00A76.3, against a runtime backend's capabilities, not by decoding, so no file yields it on its own.
- `warnings/` — files that decode successfully with an exact list of expected warnings: unknown chunk, unknown descriptor `kind` next to a valid set, unknown `norm`, unknown optional extension.
- `noncanonical/` — valid files that are **not** what the canonical writer (§7.3) would produce, each paired with the `valid/` file it is equivalent to: different manifest key order; insignificant whitespace; an explicit empty `params`; an unknown top-level key; an unknown non-required extension payload on a descriptor set; **`params` whose keys are unsorted and include `"9"` and `"10"`**, which catches an implementation that serialized them with `JSON.stringify`.

### 8.2 Required tests (every implementation)

1. `decode(valid/minimal.wnft)` equals `valid/minimal.json`.
2. **Same-implementation round trip:** `encode(decode(f))` is byte-identical to `f` for every `valid/` fixture. The guarantee is scoped to **canonical files whose content the implementation fully understands**, which every `valid/` fixture is by construction — §7.3 discards unknown content, so no implementation can promise byte identity for a file carrying some.
3. **Non-canonical inputs:** every `noncanonical/` fixture decodes to the same values as its `valid/` counterpart, and `encode(decode(f))` equals **that counterpart** byte for byte — not the input. This is what makes §7.3's "keeps only what it understands" testable rather than a disclaimer.
4. **Cross-implementation:** `BIN\0` chunks byte-identical; manifests equal after parsing.
5. Every `invalid/` file yields exactly its expected error code; every `warnings/` file yields `ok` with exactly its expected warnings.
6. CRC-32 test vector: `123456789` → `0xCBF43926`.
7. **The writer rejects what the reader would.** For each of the other four I-JSON checks of §5, `encode()` of an otherwise valid target whose `params` carries the offending value — an unpaired surrogate, the integer `2^53`, a number that rounds to infinity, a noncharacter — returns `{ ok: false, error: "INVALID_TARGET" }` with a `detail` naming that path, and emits no bytes. Same for a `params` value of `NaN`, which `JSON.stringify` would otherwise coerce to `null` (§7.3). Check (a) has no such test: an in-memory `params` is an object in both languages and cannot hold a duplicate member name, which is why §5 scopes key uniqueness to construction.

### 8.3 Evolution tests

- A file declaring format `0.3` is rejected by a `0.2` reader with `UNSUPPORTED_FORMAT_VERSION`.
- Unknown keys at the top level and inside a descriptor set are ignored and are not re-emitted.
- Keys inside `params` and inside `info` are **data**: they are preserved and re-emitted unchanged, whatever they are (§5.1).
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
- **Q4 — Producer mismatch strategy.** Warn only (v0.2), or store a full-resolution `referenceImage` and re-describe on the runtime backend when its scale step matches. The second avoids bit incompatibility but costs about 1 byte per pixel.
- **Q6 — Multiple targets.** v0.2 stores one target per file; a container of targets or a manifest of files could come later.
- **Q8 — Canonical JSON numbers across languages.** Defining a strict number grammar for the manifest would give byte identity of the whole file across implementations, not only of the `BIN\0` chunk. It is probably not worth the complexity; to be revisited if the cross-implementation tests turn out to need it.
- **Q9 — Media type** for serving `.wnft` (e.g. a vendor type such as `application/vnd.webarkit.nft-target`).

## 12. Revision history

- **0.1 rev 1** — accepted text ([#20](https://github.com/webarkit/webarkit/pull/20)).
- **0.1 rev 2** (2026-09-11) — editorial: round-trip scope, canonical omission of empty optionals, unknown content not preserved, `params`/`info` content preserved as data, `extensionsUsed` pruned to what the reader understands, key ordering inside `params`/`info`, and the split between a preserved unknown `kind`/`norm` and a dropped unknown `elementType`. No change to the bytes or the meaning of any valid `0.1` file.
- **0.2** (2026-09-11) — normative: the manifest must be I-JSON (Q10). Files with duplicate keys, unpaired surrogates, integers beyond ±(2^53 − 1), number literals rounding to infinity, or Unicode noncharacters in strings become invalid. The canonical writer (§7.3) must validate a target before serializing it and return `INVALID_TARGET` rather than emit a file a reader would reject, and must never coerce a value to make it serializable. No 0.1 file or codec existed, so nothing is affected.
- **0.2 rev 3** (2026-09-12) — editorial, from the first implementation's review: `dimensions` has no minimum and `detector.kind` may be any string, both stated because a writer had invented constraints the text did not impose, so a legal file decoded but could not be re-emitted (§5.5, §5.6); the writer's deliberate extra strictness on I-JSON check (c) is stated and justified, since Q8 leaves number formatting free across languages (§7.3); a limit on patches per file, the one repeated structure that had none (§6.4). No change to the bytes or the meaning of any valid `0.2` file.
- **0.2 rev 2** (2026-09-11) — editorial, from the first implementation: an unknown chunk may sit second when there is no `BIN\0` (§4.2); a missing `BIN\0` under a manifest that declares accessors is `BAD_LAYOUT` (§5.2); `keypoints.levelStart[0] = 0` stated (§5.5); a file whose every descriptor set is dropped still decodes (§5.6); the file-size limit is step 0 of the validation order (§6.1); the new warning `UNKNOWN_EXTENSION_IGNORED` (§6.2), which §8.1 already required a fixture for; readers accept a view so §3's copy fallback is reachable, and the unaligned base stops being listed as a fixture file (§3, §8.1). No change to the bytes or the meaning of any valid `0.2` file.
