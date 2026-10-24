/*
 *  hooks.mjs
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
 * A module-resolution hook that makes `@webarkit/cv-backend-jsfeatnext`
 * unresolvable, as it is on a checkout where the backend's `dist/` was never
 * built (#75).
 *
 * The backend is removed for the one spawned process this hook is loaded into,
 * and nowhere else. Deleting or renaming the backend's `dist/` from a test
 * would mutate the build the rest of the suite depends on, and race with
 * Vitest's parallel workers.
 *
 * The error it throws carries the code Node itself gives an unresolvable
 * package, `ERR_MODULE_NOT_FOUND`, so the tool under test sees exactly what it
 * would see on such a checkout.
 */

const BACKEND = "@webarkit/cv-backend-jsfeatnext";

export async function resolve(specifier, context, next) {
    if (specifier === BACKEND || specifier.startsWith(`${BACKEND}/`)) {
        const err = new Error(`Cannot find package '${specifier}'`);
        err.code = "ERR_MODULE_NOT_FOUND";
        throw err;
    }
    return next(specifier, context);
}
