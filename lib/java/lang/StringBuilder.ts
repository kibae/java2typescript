/*
 * This file is released under the MIT license.
 * Copyright (c) 2021, Mike Lischke
 *
 * See LICENSE-MIT.txt file for more info.
 */

import { CodePoint, StringBuffer } from ".";
import { CharSequence } from "./CharSequence";
import { IndexOutOfBoundsException } from "./IndexOutOfBoundsException";

// Note: because there's no char type in JS/TS and we defined CodePoint as a number, there's no way here to tell them
//       apart. This means a code point would be rendered as a number string. Use appendCodePoint to add a single code
//       point.
type SourceDataType =
    boolean | string | String | number | bigint | StringBuilder | StringBuffer | //Uint32Array |
    CodePoint[] | CharSequence | unknown;

type SourceData = SourceDataType[];

export class StringBuilder implements CharSequence {
    private data = new Uint32Array();

    // The used length in data (which might be larger, due to removed parts).
    private currentLength = 0;

    public constructor(content?: string | StringBuilder | Uint32Array) {
        if (content) {
            this.append(content);
        }
    }

    public get text(): string {
        return String.fromCodePoint(...this.data.subarray(0, this.currentLength));
    }

    public get buffer(): ArrayBuffer {
        return this.data.buffer;
    }

    public clear(): this {
        this.data = new Uint32Array();
        this.currentLength = 0;

        return this;
    }

    /**
     * Inserts the new content at the beginning of the existing content.
     *
     * @param newContent The content to insert.
     *
     * @returns Itself for method chaining.
     */
    public prepend(...newContent: SourceData): this;
    public prepend(buffer: CodePoint[] | CharSequence, start?: number, end?: number): this;
    public prepend(...data: unknown[]): this {
        if (data.length > 0) {
            const candidate = data[0];
            if (Array.isArray(candidate) || this.isCharSequence(candidate)) {
                const start = data[1] as number;
                const end = data[2] as number;
                this.insertListData(0, candidate, start, end);
            } else {
                this.insertData(0, ...data);
            }
        }

        return this;
    }

    public append(...newContent: SourceData): this;
    public append(buffer: CodePoint[] | CharSequence, start?: number, end?: number): this;
    public append(...data: unknown[]): this {
        if (data.length > 0) {
            const candidate = data[0];
            if (Array.isArray(candidate) || this.isCharSequence(candidate)) {
                const start = data[1] as number;
                const end = data[2] as number;
                this.insertListData(this.currentLength, candidate, start, end);
            } else {
                this.insertData(this.currentLength, ...data);
            }
        }

        return this;
    }

    public appendLine(text?: string): this {
        this.append(text, "\n");

        return this;
    }

    public appendCodePoint(c: CodePoint): this {
        this.append(String.fromCodePoint(c));

        return this;
    }

    // Returns the current capacity.
    public capacity(): number {
        return this.data.length;
    }

    // Returns the char value in this sequence at the specified index.
    public charAt(index: number): CodePoint {
        if (index < 0 || index >= this.currentLength) {
            throw new IndexOutOfBoundsException();
        }

        return this.data.at(index);
    }

    // Returns the character (Unicode code point) at the specified index.
    public codePointAt(index: number): CodePoint {
        if (index < 0 || index >= this.currentLength) {
            throw new IndexOutOfBoundsException();
        }

        return this.data.at(index);
    }

    // Returns the character (Unicode code point) before the specified index.
    public codePointBefore(index: number): CodePoint {
        if (index < 1 || index >= this.currentLength) {
            throw new IndexOutOfBoundsException();
        }

        return this.data.at(index - 1);
    }

    // Returns the number of Unicode code points in the specified text range of this sequence.
    public codePointCount(beginIndex: number, endIndex: number): number {
        if (beginIndex < 0 || beginIndex >= this.currentLength) {
            throw new IndexOutOfBoundsException();
        }

        if (endIndex < 0 || endIndex >= this.currentLength) {
            throw new IndexOutOfBoundsException();
        }

        if (beginIndex > endIndex) {
            throw new IndexOutOfBoundsException();
        }

        return endIndex - beginIndex - 1;
    }

    // Removes the characters in a substring of this sequence.
    public delete(start: number, end: number): this {
        if (start < 0 || start >= this.currentLength) {
            throw new IndexOutOfBoundsException();
        }

        if (end < 0 || end >= this.currentLength) {
            throw new IndexOutOfBoundsException();
        }

        if (start > end) {
            throw new IndexOutOfBoundsException();
        }

        this.data.copyWithin(start, end);
        this.currentLength -= end - start + 1;

        return this;
    }

    // Removes the char at the specified position in this sequence.
    public deleteCharAt(index: number): this {
        this.delete(index, index);

        return this;
    }

    // Ensures that the capacity is at least equal to the specified minimum.
    public ensureCapacity(minimumCapacity: number): void {
        if (minimumCapacity > this.data.length) {
            const newData = new Uint32Array(minimumCapacity);
            newData.set(this.data);
            this.data = newData;

            // The current length doesn't change.
        }
    }

    // Characters are copied from this sequence into the destination character array dst.
    public getChars(srcBegin: number, srcEnd: number, dst: Uint32Array, dstBegin: number): void {
        if (srcBegin < 0 || dstBegin < 0) {
            throw new IndexOutOfBoundsException();
        }

        if (srcBegin > srcEnd || srcEnd > this.currentLength) {
            throw new IndexOutOfBoundsException();
        }

        if (dstBegin + srcEnd - srcBegin > dst.length) {
            throw new IndexOutOfBoundsException();
        }

        dst.set(this.data.subarray(srcBegin, srcEnd), dstBegin);
    }

    // Returns the index within this string of the first occurrence of the specified substring,
    // starting at the specified index.
    public indexOf(str: string, fromIndex?: number): number {
        return this.text.indexOf(str, fromIndex);
    }

    // Inserts the string representation of the boolean argument into this sequence.
    public insert(offset: number, b: SourceData): this {
        this.insertData(offset, ...b);

        return this;
    }

    // Returns the index within this string of the last occurrence of the specified substring.
    public lastIndexOf(str: string, fromIndex?: number): number {
        return this.text.lastIndexOf(str, fromIndex);
    }

    // Returns the length (character count).
    public length(): number {
        return this.currentLength;
    }

    // Returns the index within this sequence that is offset from the given index by codePointOffset code points.
    public offsetByCodePoints(index: number, codePointOffset: number): number {
        if (index < 0 || index >= this.currentLength) {
            throw new IndexOutOfBoundsException();
        }

        if (codePointOffset >= 0 && index + codePointOffset >= this.currentLength) {
            throw new IndexOutOfBoundsException();
        }

        if (index + codePointOffset < 0) {
            throw new IndexOutOfBoundsException();
        }

        return index + codePointOffset;
    }

    // Replaces the characters in a substring of this sequence with characters in the specified String.
    public replace(start: number, end: number, str: string): this {
        this.delete(start, end);
        this.insertData(start, str);

        return this;
    }

    // Causes this character sequence to be replaced by the reverse of the sequence.
    public reverse(): this {
        this.data.reverse();

        return this;
    }

    // The character at the specified index is set to ch.
    public setCharAt(index: number, ch: CodePoint): void {
        if (index < 0 || index >= this.currentLength) {
            throw new IndexOutOfBoundsException();
        }

        this.data.set([ch], index);
    }

    // Sets the length of the character sequence.
    public setLength(newLength: number): void {
        if (newLength === this.currentLength) {
            return;
        }

        if (newLength < this.currentLength) {
            this.currentLength = newLength;
        } else if (newLength > this.currentLength && newLength < this.data.length) {
            // No need to copy anything if we still have enough room.
            this.currentLength = newLength;
        } else {
            // New length is larger than the current data size. Create a new array and copy the existing content.
            // Any further entry is initialized to zero.
            const newData = new Uint32Array(newLength);
            this.currentLength = newLength;
            newData.set(this.data, 0);

            this.data = newData;
        }
    }

    // Returns a new character sequence that is a subsequence of this sequence.
    public subSequence(start: number, end: number): StringBuilder {
        return new StringBuilder(this.data.subarray(start, end));
    }

    // Returns a new String that contains a subsequence of characters currently contained in this sequence.
    public substring(start: number, end?: number): string {
        return this.text.substring(start, end);
    }

    // Returns a string representing the data in this sequence.
    public toString(): string {
        return this.text;
    }

    public array(): Uint32Array {
        return this.data.subarray(0, this.currentLength);
    }

    // Attempts to reduce storage used for the character sequence.
    public trimToSize(): void {
        if (this.currentLength < this.data.length) {
            const newData = new Uint32Array(this.currentLength);
            newData.set(this.data.subarray(0, this.currentLength), 0);

            this.data = newData;
        }
    }

    private insertData(position: number, ...newContent: SourceData): void {
        const list: Uint32Array[] = [];
        let additionalSize = 0;
        newContent.forEach((entry) => {
            if (entry instanceof StringBuilder) {
                if (entry.data.length > 0) {
                    list.push(entry.data);
                    additionalSize += entry.data.length;
                }
            } else if (entry instanceof Uint32Array) {
                if (entry.length > 0) {
                    list.push(entry);
                    additionalSize += entry.length;
                }
            } else if (entry) {
                const text = entry.toString();
                if (text.length > 0) {
                    const codePoints: number[] = [];
                    for (const value of text) { // To correctly iterate UTF-16 surrogate pairs.
                        codePoints.push(value.codePointAt(0));
                    }

                    const array = Uint32Array.from(codePoints);
                    additionalSize += array.length;
                    list.push(array);
                }
            }
        });

        if (list.length === 0) {
            return;
        }

        const requiredSize = this.currentLength + additionalSize;
        if (requiredSize <= this.data.length) {
            // No need to re-allocate. There's still room for the new data.
            if (position < this.currentLength) {
                this.data.copyWithin(additionalSize, position, this.currentLength);
            }

            list.forEach((data) => {
                this.data.set(data, position);
                position += data.length;
            });

            this.currentLength = requiredSize;
        } else {
            const newData = new Uint32Array(additionalSize + this.data.length);
            if (position > 0) {
                // Copy what's before the target position.
                newData.set(this.data.subarray(0, position), 0);
            }

            // Add the new data.
            let offset = position;
            list.forEach((data) => {
                newData.set(data, offset);
                offset += data.length;
            });

            if (position < this.currentLength) {
                // Copy the rest from the original data.
                newData.set(this.data.subarray(position, this.currentLength), offset);
            }

            this.data = newData;
            this.currentLength = newData.length;
        }
    }

    /**
     * A special version of the insertData method, which deals specifically with char arrays and sequences.
     *
     * @param position The position where to add the new content.
     * @param data The content to add.
     * @param start Optional start position in the source list.
     * @param end Optional end position in the source list.
     */
    private insertListData(position: number, data: CodePoint[] | CharSequence, start?: number, end?: number): void {
        let array: Uint32Array;
        let additionalSize: number;

        if (Array.isArray(data)) {
            if (start) {
                array = Uint32Array.from(data.slice(start, end));
            } else {
                array = Uint32Array.from(data);
            }
            additionalSize = data.length;
        } else {
            start ??= 0;
            end ??= data.length();

            additionalSize = end - start;
            array = new Uint32Array(additionalSize);
            for (let i = start; i < end; ++i) {
                array[i] = data.charAt(i);
            }
        }

        const requiredSize = this.currentLength + additionalSize;
        if (requiredSize <= this.data.length) {
            // No need to re-allocate. There's still room for the new data.
            if (position < this.currentLength) {
                this.data.copyWithin(additionalSize, position, this.currentLength);
            }

            this.data.set(array, position);
            this.currentLength = requiredSize;
        } else {
            const newData = new Uint32Array(additionalSize + this.data.length);
            if (position > 0) {
                // Copy what's before the target position.
                newData.set(this.data.subarray(0, position), 0);
            }

            // Add the new data.
            newData.set(array, position);

            if (position < this.currentLength) {
                // Copy the rest from the original data.
                newData.set(this.data.subarray(position, this.currentLength), position);
            }

            this.data = newData;
            this.currentLength = newData.length;
        }
    }

    private isCharSequence(candidate: unknown): candidate is CharSequence {
        return (candidate as CharSequence).charAt !== undefined;
    }
}

