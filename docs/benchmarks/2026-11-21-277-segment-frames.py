#
#  2026-11-21-277-segment-frames.py
#  webarkit
#
#  This file is part of webarkit.
#
#  SPDX-License-Identifier: LGPL-3.0-or-later
#
#  This program is free software: you can redistribute it and/or modify
#  it under the terms of the GNU Lesser General Public License as published by
#  the Free Software Foundation, either version 3 of the License, or
#  (at your option) any later version.
#
#  This program is distributed in the hope that it will be useful,
#  but WITHOUT ANY WARRANTY; without even the implied warranty of
#  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#  GNU Lesser General Public License for more details.
#
#  You should have received a copy of the GNU Lesser General Public License
#  along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
#  Copyright 2026 WebARKit.
#
#  Author(s): Walter Perdan @kalwalt https://github.com/kalwalt
#

"""#277: artoolkit-nft-bench's segment.py on raw RGB frames read from stdin. Called by
2026-11-21-277-segmented-reference.mjs, which decodes the clip with ffmpeg exactly as the replay
does and pipes the frames in; not meant to be run by hand.

    python 2026-11-21-277-segment-frames.py <width> <height> [--overlay-dir D] [--overlay-frames 0,4,11]
        [--overlay-sample <size>,<seed> --frame-count <n>] [--overlay-scale 3]

PYTHONPATH must hold artoolkit-nft-bench's python/ folder. Per frame it calls segment_quad and
order_corners as segment_bank does (python/nftbench/segment.py: min_conf 0.5, corners ordered
against the last accepted quad), and prints one JSON line: index, accepted, the rejection reason,
the confidence, the corners TL, TR, BR, BL. segment.py itself is not changed: a rejection's reason
is the `return None, 0.0` line segment_quad returned from, read by a trace and named by that
line's condition. The first line printed records the versions; the last, the frame count.
"""
import hashlib
import inspect
import json
import platform
import sys

import cv2
import numpy as np
import nftbench.segment as seg

MIN_CONF = 0.5  # segment_bank's default, which segmentation.md's run used

# A rejection's name, from the condition guarding the `return None, 0.0` it took. Every such
# return in segment_quad must match exactly one, or the driver refuses to run.
REASONS = [
    ("dist.max() < 6.0", "no-contrast"),
    ("n < 2", "no-component"),
    ("area < min_area_frac", "too-small"),
    ("x <= 1 or y <= 1", "touches-border"),
    ("approx is None", "no-quadrilateral"),
    ("rect < 0.9", "not-rectangular"),
    ("l is None for l in lines", "side-refinement-failed"),
    ("c is None for c in corners", "parallel-sides"),
    ("np.max(np.linalg.norm(quad - rough", "refinement-disagrees"),
    ("MARKER_ASPECT * 0.65", "aspect"),
]


def reason_lines():
    src, first = inspect.getsourcelines(seg.segment_quad)
    out = {}
    for k, line in enumerate(src):
        if "return None, 0.0" not in line:
            continue
        cond = line if line.strip().startswith("if ") else src[k - 1]
        names = [name for pat, name in REASONS if pat in cond]
        if len(names) != 1:
            raise SystemExit(f"segment_quad line {first + k}: {len(names)} reasons match {cond.strip()!r}")
        out[first + k] = names[0]
    if sorted(out.values()) != sorted(name for _, name in REASONS):
        raise SystemExit(f"segment_quad's rejections are not the driver's: {sorted(out.values())}")
    return out


def main():
    a = sys.argv[1:]
    width, height = int(a[0]), int(a[1])
    opt = {a[i]: a[i + 1] for i in range(2, len(a), 2)}
    overlay_dir = opt.get("--overlay-dir")
    overlay_frames = {int(x) for x in opt.get("--overlay-frames", "").split(",") if x}
    if "--overlay-sample" in opt:
        # segment_bank's spot-check draw: `size` frames of `count`, numpy's default_rng(seed), no replacement.
        size, seed = (int(x) for x in opt["--overlay-sample"].split(","))
        count = int(opt["--frame-count"])
        overlay_frames |= {int(k) for k in np.random.default_rng(seed).choice(count, size=min(size, count), replace=False)}
    overlay_scale = int(opt.get("--overlay-scale", "3"))
    lines = reason_lines()
    returned = {}
    code = seg.segment_quad.__code__

    def local(frame, event, arg):
        if event == "return":
            returned["line"] = frame.f_lineno
        return local

    def tracer(frame, event, arg):
        return local if frame.f_code is code else None

    with open(seg.__file__, "rb") as f:
        seg_sha = hashlib.sha256(f.read()).hexdigest()
    print(json.dumps({"python": platform.python_version(), "opencv": cv2.__version__, "numpy": np.__version__,
                      "segment_py": seg.__file__, "segment_py_sha256": seg_sha, "min_conf": MIN_CONF,
                      "overlay_frames": sorted(overlay_frames)}), flush=True)
    n = width * height * 3
    stdin = sys.stdin.buffer
    prev = None
    i = 0
    while True:
        buf = stdin.read(n)
        if not buf:
            break
        if len(buf) != n:
            raise SystemExit(f"frame {i}: {len(buf)} bytes, a frame is {n}")
        rgb = np.frombuffer(buf, np.uint8).reshape(height, width, 3)
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        returned.clear()
        sys.settrace(tracer)
        try:
            quad, conf = seg.segment_quad(bgr)
        finally:
            sys.settrace(None)
        row = {"i": i, "accepted": False, "reason": None, "conf": round(float(conf), 4), "corners": None}
        if quad is not None and conf >= MIN_CONF:
            quad = seg.order_corners(quad, prev).astype(np.float32)
            prev = quad
            row["accepted"] = True
            row["corners"] = [[float(x), float(y)] for x, y in quad.reshape(4, 2)]
        elif quad is not None:
            row["reason"] = "low-confidence"
        else:
            line = returned.get("line")
            if line not in lines:
                raise SystemExit(f"frame {i}: segment_quad returned no quad from line {line}, not a known rejection")
            row["reason"] = lines[line]
        if overlay_dir and i in overlay_frames:
            vis = cv2.resize(bgr, (width * overlay_scale, height * overlay_scale), interpolation=cv2.INTER_NEAREST)
            if row["corners"] is not None:
                q = (np.array(row["corners"]) + 0.5) * overlay_scale - 0.5
                cv2.polylines(vis, [np.round(q).astype(np.int32)], True, (0, 255, 0), 1)
                cv2.circle(vis, tuple(int(v) for v in np.round(q[0])), 4, (0, 0, 255), -1)
            else:
                cv2.putText(vis, row["reason"], (8, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            cv2.putText(vis, f"#{i}", (8, vis.shape[0] - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
            cv2.imwrite(f"{overlay_dir}/frame-{i:04d}.png", vis)
        print(json.dumps(row), flush=True)
        i += 1
    print(json.dumps({"frames": i}), flush=True)


if __name__ == "__main__":
    main()
