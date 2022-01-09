/*
 * This file is released under the MIT license.
 * Copyright (c) 2021, Mike Lischke
 *
 * See LICENSE file for more info.
 */

export class LinkedHashMap<K, V> extends Map<K, V> {
    /**
     * @param value
     * @returns true if this map maps at least one keys to the specified value.
     */
    public containsValue(value: V): boolean {
        this.forEach((candidate: V) => {
            if (candidate === value) {
                return true;
            }
        });

        return false;
    }

    /**
     * @returns a set view of the mappings contained in this map.
     */
    public entrySet(): Set<[K, V]> {
        const result = new Set<[K, V]>();
        for (const tuple of this) {
            result.add(tuple);
        }

        return result;
    }

    /**
     * @param key
     * @param defaultValue
     * @returns the value to which the specified key is mapped, or defaultValue if this map contains no mapping
     *          for the key.
     */
    public getOrDefault(key: K, defaultValue: V): V {
        return this.get(key) ?? defaultValue;
    }

    /**
     * @returns a Set view of the keys contained in this map.
     */
    public keySet(): Set<K> {
        return new Set(this.keys());
    }

    /**
     * Alias to .set()
     *
     * @param key
     * @param value
     *
     * @returns This map.
     */
    public put = (key: K, value: V): this => {
        return this.set(key, value);
    };
}
