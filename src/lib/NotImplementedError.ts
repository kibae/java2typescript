/*
 * This file is released under the MIT license.
 * Copyright (c) 2022, Mike Lischke
 *
 * See LICENSE-MIT.txt file for more info.
 */

export class NotImplementedError extends Error {
    public constructor(message?: string) {
        super(message ?? "This feature has no implementation");
    }
}