import { StringEncodingOptions } from "./string-encoding-options";

let maskMap: Map<number, number>;

/**
 * Represents a request to read a number of bits
 */
interface BitstreamRequest {
    resolve : (buffer : number) => void;
    reject: (error: Error) => void;
    promise: Promise<number>;
    length : number;
    signed? : boolean;
    float? : boolean;
    assure? : boolean;
}

/**
 * A class which lets you read through one or more Buffers bit-by-bit. All data is read in big-endian (network) byte 
 * order
 */
export class BitstreamReader {
    private buffers : Uint8Array[] = [];
    private bufferedLength : number = 0;
    private blockedRequest : BitstreamRequest = null;
    private _offsetIntoBuffer = 0;
    private _bufferIndex = 0;
    private _offset = 0;
    private _spentBufferSize = 0;

    /**
     * Get the index of the buffer currently being read. This will always be zero unless retainBuffers=true
     */
    get bufferIndex() {
        return this._bufferIndex;
    }

    /**
     * Get the current offset in bits, starting from the very first bit read by this reader (across all 
     * buffers added)
     */
    get offset() {
        return this._offset;
    }

    /**
     * The total number of bits which were in buffers that have previously been read, and have since been discarded.
     */
    get spentBufferSize() {
        return this._spentBufferSize;
    }

    /**
     * Set the current offset in bits, as measured from the very first bit read by this reader (across all buffers
     * added). If the given offset points into a previously discarded buffer, an error will be thrown. See the 
     * retainBuffers option if you need to seek back into previous buffers. If the desired offset is in a previous
     * buffer which has not been discarded, the current read head is moved into the appropriate offset of that buffer.
     */
    set offset(value) {
        if (value < this._spentBufferSize) {
            throw new Error(
                `Offset ${value} points into a discarded buffer! ` 
                + `If you need to seek backwards outside the current buffer, make sure to set retainBuffers=true`
            );
        }

        let offsetIntoBuffer = value - this._spentBufferSize;
        let bufferIndex = 0;
        
        for (let i = 0, max = this.buffers.length; i < max; ++i) {
            let buf = this.buffers[i];
            let size = buf.length * 8;
            if (offsetIntoBuffer < size) {
                this._bufferIndex = bufferIndex;
                this._offset = value;
                this._offsetIntoBuffer = offsetIntoBuffer;
                this.bufferedLength = buf.length * 8 - this._offsetIntoBuffer;
                for (let j = i + 1; j < max; ++j)
                    this.bufferedLength += this.buffers[j].length * 8;

                return;
            }

            offsetIntoBuffer -= size;
            ++bufferIndex;
        }
    }

    /**
     * Run a function which can synchronously read bits without affecting the read head after the function 
     * has finished.
     * @param func 
     */
    simulateSync<T>(func: () => T) {
        let oldRetainBuffers = this.retainBuffers;
        let originalOffset = this.offset;
        this.retainBuffers = true;
        try {
            return func();
        } finally {
            this.retainBuffers = oldRetainBuffers;
            this.offset = originalOffset;
        }
    }

    /**
     * Run a function which can asynchronously read bits without affecting the read head after the function 
     * has finished.
     * @param func 
     */
    async simulate<T>(func: () => Promise<T>) {
        let oldRetainBuffers = this.retainBuffers;
        let originalOffset = this.offset;
        this.retainBuffers = true;
        try {
            return await func();
        } finally {
            this.retainBuffers = oldRetainBuffers;
            this.offset = originalOffset;
        }
    }

    /**
     * When true, buffers are not removed, which allows the user to 
     * "rewind" the current offset back into buffers that have already been 
     * visited. If you enable this, you will need to remove buffers manually using 
     * clean()
     */
    retainBuffers : boolean = false;

    /**
     * Remove any fully used up buffers. Only has an effect if retainBuffers is true.
     * Optional `count` parameter lets you control how many buffers can be freed.
     */
    clean(count?: number) {
        /**
         * PERFORMANCE SENSITIVE
         * Previous versions of this function caused as much as an 18% overhead on top of simple 
         * byte-aligned reads.
         */
        let spent = count !== void 0 ? Math.min(count, this._bufferIndex) : this._bufferIndex;
        for (let i = 0, max = spent; i < max; ++i) {
            this._spentBufferSize += this.buffers[0].length * 8;
            this.buffers.shift();
        }

        this._bufferIndex -= spent;
    }

    /**
     * The number of bits that are currently available.
     */
    get available() {
        return this.bufferedLength - this.skippedLength;
    }

    /**
     * Check if the given number of bits are currently available.
     * @param length The number of bits to check for
     * @returns True if the required number of bits is available, false otherwise
     */
    isAvailable(length : number) {
        return this.bufferedLength >= length;
    }

    private ensureNoReadPending() {
        if (this.blockedRequest)
            throw new Error(`Only one read() can be outstanding at a time.`);
    }

    private textDecoder = new TextDecoder();

    /**
     * Asynchronously read the given number of bytes, encode it into a string, and return the result,
     * optionally using a specific text encoding.
     * @param length The number of bytes to read
     * @param options A set of options to control conversion into a string. @see StringEncodingOptions
     * @returns The resulting string
     */
    async readString(length : number, options? : StringEncodingOptions): Promise<string> {
        this.ensureNoReadPending();
        await this.assure(8*length);
        return this.readStringSync(length, options);
    }

    /**
     * Synchronously read the given number of bytes, encode it into a string, and return the result,
     * optionally using a specific text encoding.
     * @param length The number of bytes to read
     * @param options A set of options to control conversion into a string. @see StringEncodingOptions
     * @returns The resulting string
     */
    readStringSync(length : number, options? : StringEncodingOptions): string {
        if (!options)
            options = {};
        
        this.ensureNoReadPending();

        let buffer = new Uint8Array(length);
        let firstTerminator = -1;
        let charLength = 1;
        let encoding = options.encoding ?? 'utf-8';

        if (['utf16le', 'ucs-2', 'ucs2'].includes(encoding)) {
            charLength = 2;
        }

        for (let i = 0, max = length; i < max; ++i) {
            buffer[i] = this.readSync(8);
        }

        for (let i = 0, max = length; i < max; i += charLength) {
            let char = buffer[i];
            if (charLength === 2)
                char = (char << 8) | (buffer[i+1] ?? 0);

            if (char === 0) {
                firstTerminator = i;
                break;
            }
        }

        if (options.nullTerminated !== false) {
            if (firstTerminator >= 0) {
                buffer = buffer.subarray(0, firstTerminator);
            }
        }

        if (encoding === 'utf-8') {
            return this.textDecoder.decode(buffer);
        } else {
            if (typeof Buffer === 'undefined')
                throw new Error(`Encoding '${encoding}' is not supported: No Node.js Buffer implementation and TextDecoder only supports utf-8`);
            return Buffer.from(buffer).toString(<BufferEncoding>encoding);
        }
    }

    /**
     * Read a number of the given bitlength synchronously without advancing
     * the read head.
     * @param length The number of bits to read
     * @returns The number read from the bitstream
     */
    peekSync(length : number) {
        return this.readCoreSync(length, false);
    }

    private skippedLength = 0;

    /**
     * Skip the given number of bits. 
     * @param length The number of bits to skip
     */
    skip(length : number) {
        this.skippedLength += length;
    }
    
    /**
     * Read an unsigned integer of the given bit length synchronously. If there are not enough 
     * bits available, an error is thrown.
     * 
     * @param length The number of bits to read
     * @returns The unsigned integer that was read
     */
    readSync(length : number): number {
        return this.readCoreSync(length, true);
    }

    /**
     * Read a number of bytes from the stream. Returns a generator that ends when the read is complete,
     * and yields a number of *bytes* still to be read (not bits like in other read methods)
     * 
     * @param buffer The buffer/typed array to write to
     * @param offset The offset into the buffer to write to. Defaults to zero
     * @param length The length of bytes to read. Defaults to the length of the array (sans the offset)
     */
    *readBytes(buffer : Uint8Array, offset : number = 0, length? : number): Generator<number, any> {
        length ??= buffer.length - offset;

        let bitOffset = this._offsetIntoBuffer % 8;

        // If this is a byte-aligned read, we can do this more optimally than using readSync

        if (bitOffset === 0) {
            if (globalThis.BITSTREAM_TRACE) {
                console.log(`------------------------------------------------------------    Byte-aligned readBytes(), length=${length}`);
                console.log(`------------------------------------------------------------    readBytes(): Pre-operation: buffered=${this.bufferedLength} bits, bufferIndex=${this._bufferIndex}, bufferOffset=${this._offsetIntoBuffer}, bufferLength=${this.buffers[this._bufferIndex]?.length || '<none>'} bufferCount=${this.buffers.length}`);
            }
            let remainingLength = length;
            let destBufferOffset = 0;
            while (remainingLength > 0) {
                if (this.available < remainingLength * 8)
                    yield Math.max((remainingLength * 8 - this.available) / 8);

                let bufferOffset = Math.floor(this._offsetIntoBuffer / 8);
                let contributionBuffer = this.buffers[this._bufferIndex];
                let contribution = Math.min(remainingLength, contributionBuffer.length);

                for (let i = 0; i < contribution; ++i)
                    buffer[destBufferOffset + i] = contributionBuffer[bufferOffset + i];

                destBufferOffset += contribution;

                let contributionBits = contribution * 8;
                this.consume(contributionBits);
                remainingLength -= contributionBits;

                if (globalThis.BITSTREAM_TRACE) {
                    console.log(`------------------------------------------------------------    readBytes(): consumed=${contribution} bytes, remaining=${remainingLength}`);
                    console.log(`------------------------------------------------------------    readBytes(): buffered=${this.bufferedLength} bits, bufferIndex=${this._bufferIndex}, bufferOffset=${this._offsetIntoBuffer}, bufferCount=${this.buffers.length}`);
                }
            }
        } else {

            // Non-byte-aligned, we need to construct bytes using bit-wise operations.
            // readSync is perfect for this 

            for (let i = offset, max = Math.min(buffer.length, offset+length); i < max; ++i) {
                if (!this.isAvailable(8))
                    yield max - i;
                
                buffer[i] = this.readSync(8);
            }
        }

        return buffer;
    }

    /**
     * Read a number of bytes from the stream synchronously. If not enough bytes are available, an 
     * exception is thrown.
     * 
     * @param buffer The buffer/typed array to write to
     * @param offset The offset into the buffer to write to. Defaults to zero
     * @param length The length of bytes to read. Defaults to the length of the array (sans the offset)
     */
    readBytesSync(buffer : Uint8Array, offset : number = 0, length? : number): Uint8Array {
        length ??= buffer.length - offset;
        let gen = this.readBytes(buffer, offset, length);

        while (true) {
            let result = gen.next();
            if (result.done === false)
                throw new Error(`underrun: Not enough bits are available (requested ${length} bytes)`);
            else
                break;
        }

        return buffer;
    }

    /**
     * Read a number of bytes from the stream. Blocks and waits for more bytes if not enough bytes are available.
     * 
     * @param buffer The buffer/typed array to write to
     * @param offset The offset into the buffer to write to. Defaults to zero
     * @param length The length of bytes to read. Defaults to the length of the array (sans the offset)
     */
    async readBytesBlocking(buffer : Uint8Array, offset : number = 0, length? : number) {
        length ??= buffer.length - offset;
        let gen = this.readBytes(buffer, offset, length);

        while (true) {
            let result = gen.next();
            if (result.done === false)
                await this.assure(result.value*8);
            else
                break;
        }

        return buffer;
    }

    /**
     * Read a two's complement signed integer of the given bit length synchronously. If there are not
     * enough bits available, an error is thrown.
     * 
     * @param length The number of bits to read
     * @returns The signed integer that was read
     */
    readSignedSync(length : number): number {
        const u = this.readSync(length);
        const signBit = (2**(length - 1));
        const mask = signBit - 1;
        return (u & signBit) === 0 ? u : -((~(u - 1) & mask) >>> 0);
    }

    private maskOf(bits: number) {
        if (!maskMap) {
            maskMap = new Map();
            for (let i = 0; i <= 64; ++i) {
                maskMap.set(i, Math.pow(0x2, i) - 1);
            }
        }

        return maskMap.get(bits) ?? (Math.pow(0x2, bits) - 1);
    }


    
    /**
     * Read an IEEE 754 floating point value with the given bit length (32 or 64). If there are not 
     * enough bits available, an error is thrown.
     * 
     * @param length Must be 32 for 32-bit single-precision or 64 for 64-bit double-precision. All
     *        other values result in TypeError
     * @returns The floating point value that was read
     */
    readFloatSync(length : number): number {
        if (length !== 32 && length !== 64)
            throw new TypeError(`Invalid length (${length} bits) Only 4-byte (32 bit / single-precision) and 8-byte (64 bit / double-precision) IEEE 754 values are supported`);
        
        if (!this.isAvailable(length))
            throw new Error(`underrun: Not enough bits are available (requested=${length}, available=${this.bufferedLength}, buffers=${this.buffers.length})`);

        let buf = new ArrayBuffer(length / 8);
        let view = new DataView(buf);

        for (let i = 0, max = buf.byteLength; i < max; ++i)
            view.setUint8(i, this.readSync(8));
        
        if (length === 32)
            return view.getFloat32(0, false);
        else if (length === 64)
            return view.getFloat64(0, false);
    }

    private readByteAligned(consume: boolean): number {
        let buffer = this.buffers[this._bufferIndex];
        let value = buffer[this._offsetIntoBuffer / 8];

        if (consume) {
            this.bufferedLength -= 8;
            this._offsetIntoBuffer += 8;
            this._offset += 8;
            if (this._offsetIntoBuffer >= buffer.length * 8) {
                this._bufferIndex += 1;
                this._offsetIntoBuffer = 0;
                if (!this.retainBuffers) {
                    this.clean();
                }
            }
        }

        return value;
    }

    private consume(length: number) {
        this.bufferedLength -= length;
        this._offsetIntoBuffer += length;
        this._offset += length;

        let buffer = this.buffers[this._bufferIndex];
        while (buffer && this._offsetIntoBuffer >= (buffer.length * 8)) {
            this._bufferIndex += 1;
            this._offsetIntoBuffer -= buffer.length * 8;
            buffer = this.buffers[this._bufferIndex];
            if (!this.retainBuffers)
                this.clean();
        }
    }

    private readShortByteAligned(consume: boolean, byteOrder: 'lsb' | 'msb'): number {
        let buffer = this.buffers[this._bufferIndex];
        let bufferOffset = this._offsetIntoBuffer / 8;
        let firstByte = buffer[bufferOffset];
        let secondByte: number;

        if (bufferOffset + 1 >= buffer.length)
            secondByte = this.buffers[this._bufferIndex + 1][0];
        else
            secondByte = buffer[bufferOffset + 1];

        if (consume)
            this.consume(16);

        if (byteOrder === 'lsb') {
            let carry = firstByte;
            firstByte = secondByte;
            secondByte = carry;
        }

        return firstByte << 8 | secondByte;
    }

    private readLongByteAligned(consume: boolean, byteOrder: 'lsb' | 'msb'): number {
        let bufferIndex = this._bufferIndex;
        let buffer = this.buffers[bufferIndex];
        let bufferOffset = this._offsetIntoBuffer / 8;

        let firstByte = buffer[bufferOffset++];
        if (bufferOffset >= buffer.length) {
            buffer = this.buffers[++bufferIndex];
            bufferOffset = 0;
        }

        let secondByte = buffer[bufferOffset++];
        if (bufferOffset >= buffer.length) {
            buffer = this.buffers[++bufferIndex];
            bufferOffset = 0;
        }

        let thirdByte = buffer[bufferOffset++];
        if (bufferOffset >= buffer.length) {
            buffer = this.buffers[++bufferIndex];
            bufferOffset = 0;
        }

        let fourthByte = buffer[bufferOffset++];
        if (bufferOffset >= buffer.length) {
            buffer = this.buffers[++bufferIndex];
            bufferOffset = 0;
        }

        if (consume)
            this.consume(32);

        let highBit = ((firstByte & 0x80) !== 0);
        firstByte &= ~0x80;

        if (byteOrder === 'lsb') {
            let b1 = fourthByte;
            let b2 = thirdByte;
            let b3 = secondByte;
            let b4 = firstByte;

            firstByte = b1;
            secondByte = b2;
            thirdByte = b3;
            fourthByte = b4;
        }

        let value = firstByte << 24 | secondByte << 16 | thirdByte << 8 | fourthByte;

        if (highBit)
            value += 2**31;
        
        return value;
    }

    private read3ByteAligned(consume: boolean, byteOrder: 'lsb' | 'msb'): number {
        let bufferIndex = this._bufferIndex;
        let buffer = this.buffers[bufferIndex];
        let bufferOffset = this._offsetIntoBuffer / 8;

        let firstByte = buffer[bufferOffset++];
        if (bufferOffset >= buffer.length) {
            buffer = this.buffers[++bufferIndex];
            bufferOffset = 0;
        }

        let secondByte = buffer[bufferOffset++];
        if (bufferOffset >= buffer.length) {
            buffer = this.buffers[++bufferIndex];
            bufferOffset = 0;
        }

        let thirdByte = buffer[bufferOffset++];
        if (bufferOffset >= buffer.length) {
            buffer = this.buffers[++bufferIndex];
            bufferOffset = 0;
        }

        if (consume)
            this.consume(24);

        if (byteOrder === 'lsb') {
            let carry = firstByte;
            firstByte = thirdByte;
            thirdByte = carry;
        }

        return firstByte << 16 | secondByte << 8 | thirdByte;
    }

    private readPartialByte(length: number, consume: boolean) {
        let buffer = this.buffers[this._bufferIndex];
        let byte = buffer[Math.floor(this._offsetIntoBuffer / 8)];
        let bitOffset = this._offsetIntoBuffer % 8 | 0;

        if (consume)
            this.consume(length);

        return ((byte >> (8 - length - bitOffset)) & this.maskOf(length)) | 0;
    }

    /**
     * @param length 
     * @param consume 
     * @param byteOrder The byte order to use when the length is greater than 8 and is a multiple of 8. 
     *                  Defaults to MSB (most significant byte). If the length is not a multiple of 8, 
     *                  this is unused
     * @returns 
     */
    private readCoreSync(length : number, consume : boolean, byteOrder: 'msb' | 'lsb' = 'msb'): number {
        this.ensureNoReadPending();
        
        if (this.available < length)
            throw new Error(`underrun: Not enough bits are available (requested=${length}, available=${this.bufferedLength}, buffers=${this.buffers.length})`);

        this.adjustSkip();

        let offsetIntoByte = this._offsetIntoBuffer % 8;

        // Optimization cases //////////////////////////////////////////////////////////////////////////////

        if (offsetIntoByte === 0) {
            if (length === 8)           // Reading exactly one byte
                return this.readByteAligned(consume);
            else if (length === 16)          // Reading a 16-bit value at byte boundary
                return this.readShortByteAligned(consume, byteOrder);
            else if (length === 24)
                return this.read3ByteAligned(consume, byteOrder);
            else if (length === 32)          // Reading a 32-bit value at byte boundary
                return this.readLongByteAligned(consume, byteOrder);
        }

        if (length < 8 && ((8 - offsetIntoByte) | 0) >= length)     // Reading less than 8 bits within a single byte
            return this.readPartialByte(length, consume);

        // The remaining path covers reads which are larger than one byte or which cross over byte boundaries.

        let remainingLength = length;
        let offset = this._offsetIntoBuffer;
        let bufferIndex = this._bufferIndex;
        let bigValue: bigint = BigInt(0);
        let value: number = 0;
        let useBigInt = length > 31;

        while (remainingLength > 0) {
            /* istanbul ignore next */
            if (bufferIndex >= this.buffers.length)
                throw new Error(`Internal error: Buffer index out of range (index=${bufferIndex}, count=${this.buffers.length}), offset=${this.offset}, readLength=${length}, available=${this.available})`);

            let buffer = this.buffers[bufferIndex];
            let byteOffset = Math.floor(offset / 8);

            /* istanbul ignore next */
            if (byteOffset >= buffer.length)
                throw new Error(`Internal error: Current buffer (index ${bufferIndex}) has length ${buffer.length} but our position within the buffer is ${byteOffset}! offset=${this.offset}, bufs=${this.buffers.length}`);

            let bitOffset = offset % 8;
            let bitContribution: number;
            let byte = buffer[byteOffset];
            
            bitContribution = Math.min(8 - bitOffset, remainingLength);
            
            if (useBigInt) {
                bigValue = (bigValue << BigInt(bitContribution)) 
                    | ((BigInt(buffer[byteOffset]) >> (BigInt(8) - BigInt(bitContribution) - BigInt(bitOffset))) 
                        & BigInt(this.maskOf(bitContribution)));
            } else {
                value = (value << bitContribution) 
                    | ((byte >> (8 - bitContribution - bitOffset)) 
                        & this.maskOf(bitContribution));
            }

            // update counters

            offset += bitContribution;
            remainingLength -= bitContribution | 0;

            if (offset >= buffer.length*8) {
                bufferIndex += 1;
                offset = 0;
            }
        }

        if (consume)
            this.consume(length);

        if (useBigInt)
            return Number(bigValue);
        else
            return value;
    }

    private adjustSkip() {
        if (this.skippedLength <= 0)
            return;
        
        // First, remove any buffers that are completely skipped
        while (this.buffers && this.skippedLength > this.buffers[0].length*8-this._offsetIntoBuffer) {
            this.skippedLength -= (this.buffers[0].length*8 - this._offsetIntoBuffer);
            this._offsetIntoBuffer = 0;
            this.buffers.shift();
        }

        // If any buffers are left, then the amount of remaining skipped bits is 
        // less than the full length of the buffer, so entirely consume the skipped length
        // by putting it into the offset.
        if (this.buffers.length > 0) {
            this._offsetIntoBuffer += this.skippedLength;
            this.skippedLength = 0;
        }
    }

    /**
     * Wait until the given number of bits is available
     * @param length The number of bits to wait for
     * @param optional When true, the returned promise will resolve even if the stream ends before all bits are 
     *                 available. Otherwise, the promise will reject. 
     * @returns A promise which will resolve when the requested number of bits are available. Rejects if the stream 
     *          ends before the request is satisfied, unless optional parameter is true. 
     */
    assure(length : number, optional = false) : Promise<void> {
        this.ensureNoReadPending();

        if (this.bufferedLength >= length) {
            return Promise.resolve();
        }

        return this.block({ length, assure: true }).then(available => {
            if (available < length && !optional)
                throw this.endOfStreamError(length);
        });
    }



    /**
     * Read an unsigned integer with the given bit length, waiting until enough bits are 
     * available for the operation. 
     * 
     * @param length The number of bits to read
     * @returns A promise which resolves to the unsigned integer once it is read
     */
    read(length : number) : Promise<number> {
        this.ensureNoReadPending();
        
        if (this.available >= length) {
            return Promise.resolve(this.readSync(length));
        } else {
            return this.block({ length });
        }
    }

    /**
     * Read a two's complement signed integer with the given bit length, waiting until enough bits are 
     * available for the operation. 
     * 
     * @param length The number of bits to read
     * @returns A promise which resolves to the signed integer value once it is read
     */
    readSigned(length : number) : Promise<number> {
        this.ensureNoReadPending();
        
        if (this.available >= length) {
            return Promise.resolve(this.readSignedSync(length));
        } else {
            return this.block({ length, signed: true });
        }
    }

    private promise<T>() {
        let resolve: (value: T) => void;
        let reject: (error: Error) => void;
        let promise = new Promise<T>((rs, rj) => (resolve = rs, reject = rj));
        return { promise, resolve, reject };
    }

    private block(request: Omit<BitstreamRequest, 'resolve' | 'reject' | 'promise'>): Promise<number> {
        if (this._ended) {
            if (request.assure) {
                return Promise.resolve(this.available);
            } else {
                return Promise.reject(this.endOfStreamError(request.length));
            }
        }

        this.blockedRequest = {
            ...request,
            ...this.promise<number>()
        };

        return this.blockedRequest.promise;
    }

    /**
     * Read an IEEE 754 floating point value with the given bit length, waiting until enough bits are
     * available for the operation.
     * 
     * @param length The number of bits to read (must be 32 for 32-bit single-precision or 
     *                  64 for 64-bit double-precision)
     * @returns A promise which resolves to the floating point value once it is read
     */
    readFloat(length : number) : Promise<number> {
        this.ensureNoReadPending();
        
        if (this.available >= length) {
            return Promise.resolve(this.readFloatSync(length));
        } else {
            return this.block({ length, float: true });
        }
    }

    /**
     * Asynchronously read a number of the given bitlength without advancing the read head.
     * @param length The number of bits to read. If there are not enough bits available 
     * to complete the operation, the operation is delayed until enough bits become available.
     * @returns A promise which resolves iwth the number read from the bitstream
     */
    async peek(length : number): Promise<number> {
        await this.assure(length);
        return this.peekSync(length);
    }

    /**
     * Add a buffer onto the end of the bitstream.
     * @param buffer The buffer to add to the bitstream
     */
    addBuffer(buffer : Uint8Array) {
        if (this._ended)
            throw new Error(`Cannot add buffers to a reader which has been marked as ended without calling reset() first`);

        this.buffers.push(buffer);
        this.bufferedLength += buffer.length * 8;

        if (this.blockedRequest && this.blockedRequest.length <= this.available) {
            let request = this.blockedRequest;
            this.blockedRequest = null;

            if (request.assure) {
                request.resolve(request.length);
            } else if (request.signed) {
                request.resolve(this.readSignedSync(request.length));
            } else if (request.float) {
                request.resolve(this.readFloatSync(request.length));
            } else {
                request.resolve(this.readSync(request.length));
            }
        }
    }

    private _ended = false;
    get ended() { return this._ended; }

    reset() {
        if (this.blockedRequest) {
            throw new Error(`Cannot reset while there is a blocked request!`);
        }

        this.buffers = [];
        this.bufferedLength = 0;
        this.blockedRequest = null;
        this._offsetIntoBuffer = 0;
        this._bufferIndex = 0;
        this._offset = 0;
        this._spentBufferSize = 0;
        this._ended = false;
    }
    /**
     * Inform this reader that it will not receive any further buffers. Any requests to assure bits beyond the end of the 
     * buffer will result ss
     */
    end() {
        this._ended = true;

        if (this.blockedRequest) {
            let request = this.blockedRequest;
            this.blockedRequest = null;

            if (request.length <= this.available)
                throw new Error(`Internal inconsistency in @/bitstream: Should have granted request prior. Please report this bug.`);

            if (request.assure) {
                request.resolve(this.available);
            } else {
                request.reject(this.endOfStreamError(request.length));
            }
        }
    }

    private endOfStreamError(length: number) {
        return new Error(`End of stream reached while reading ${length} bits, only ${this.available} bits are left in the stream`)
    }
}
