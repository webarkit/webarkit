/*
 *  packages-bundle.mjs
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
 * The entry of the bench page's shared bundle, `examples/dist/webarkit-packages.mjs`,
 * which both of its detection arms load: the page through its import map, the
 * detection worker by URL. One artifact, so the two arms cannot run different
 * package code (#110, #95's provenance item).
 *
 * It is a bundle and not the packages' `dist/` because a module worker reads no
 * import map, and the packages import each other, and jsfeat-next, by bare name.
 * It is the bench page's only: the demos load the packages as a consumer does.
 *
 * `export *` drops, silently, a name two packages both export; none does today,
 * and `examples/test/packages-bundle.test.mjs` fails if one starts to.
 */

export * from "@webarkit/cv-backend-spec";
export * from "@webarkit/cv-backend-jsfeatnext";
export * from "@webarkit/nft-tracker";
