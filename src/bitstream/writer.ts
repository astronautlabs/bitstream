import { Writable } from "../common";

/**
 * A class for writing numbers of varying bitlengths to a Node.js Writable. 
 * All data is written in big-endian (network) byte order.
 */
export class BitstreamWriter {
    /**
     * Create a new writer
     * @param stream The writable stream to write to
     * @param bufferSize The number of bytes to buffer before flushing onto the writable
     */
    constructor(public stream : Writable, readonly bufferSize = 1) {
        this.buffer = new Uint8Array(bufferSize);
    }

    private pendingByte : bigint = BigInt(0);
    private pendingBits : number = 0;
    private buffer : Uint8Array;
    private bufferedBytes = 0;
    private _offset = 0;

    /**
     * How many bits have been written via this writer in total
     */
    get offset() {
        return this._offset;
    }

    /**
     * How many bits into the current byte is the write cursor.
     * If this value is zero, then we are currently byte-aligned.
     * A value of 7 means we are 1 bit away from the byte boundary.
     */
    get byteOffset() {
        return this.pendingBits;
    }

    /**
     * Finish the current byte (assuming zeros for the remaining bits, if necessary)
     * and flushes the output.
     */
    end() {
        this.finishByte();
        this.flush();
    }

    /**
     * Reset the bit offset of this writer back to zero.
     */
    reset() {
        this._offset = 0;
    }

    private finishByte() {
        if (this.pendingBits > 0) {
            this.buffer[this.bufferedBytes++] = Number(this.pendingByte);
            this.pendingBits = 0;
            this.pendingByte = BigInt(0);
        }
    }
    
    flush() {
        if (this.bufferedBytes > 0) {
            this.stream.write(Buffer.from(this.buffer.slice(0, this.bufferedBytes)));
            this.bufferedBytes = 0;
        }
    }

    private textEncoder = new TextEncoder();

    /**
     * Decode a string into a set of bytes and write it to the bitstream, bounding the string
     * by the given number of bytes, optionally using the given encoding (or UTF-8 if not specified).
     * @param byteCount The number of bytes to bound the output to
     * @param value The string to decode and write
     * @param encoding The encoding to use when writing the string. Defaults to utf-8
     */
    writeString(byteCount : number, value : string, encoding : string = 'utf-8') {
        if (encoding === 'utf-8') {
            let buffer = new Uint8Array(byteCount);
            let strBuf = this.textEncoder.encode(value);
            buffer.set(strBuf, 0);
            this.writeBytes(buffer);
        } else {
            if (typeof Buffer === 'undefined') {
                throw new Error(`Encoding '${encoding}' is not supported: No Node.js Buffer implementation found, web standard TextEncoder only supports utf-8`);
            }

            let buffer = Buffer.alloc(byteCount);
            Buffer.from(value, <any>encoding).copy(buffer);
            this.writeBuffer(buffer);
        }
    }

    /**
     * Write the given buffer to the bitstream. This is done by treating each byte as an 8-bit write.
     * Note that the bitstream does not need to be byte-aligned to call this method, meaning you can write 
     * a set of bytes at a non=zero bit offset if you wish.
     * @param buffer The buffer to write
     * @deprecated Use writeBytes() instead
     */
    writeBuffer(buffer : Uint8Array) {
        this.writeBytes(buffer);
    }

    /**
     * Write the given buffer to the bitstream. This is done by treating each byte as an 8-bit write.
     * Note that the bitstream does not need to be byte-aligned to call this method, meaning you can write 
     * a set of bytes at a non=zero bit offset if you wish.
     * @param chunk The buffer to write
     */
    writeBytes(chunk : Uint8Array, offset = 0, length? : number) {
        length ??= chunk.length - offset;

        // Fast path: Byte-aligned
        if (this.byteOffset === 0) {
            while (chunk.length > 0) {
                let writableLength = Math.min(chunk.length, this.buffer.length - this.bufferedBytes);
                this.buffer.set(chunk.subarray(0, writableLength), this.bufferedBytes);
                this.bufferedBytes += writableLength;
                chunk = chunk.subarray(writableLength);

                if (this.bufferedBytes >= this.buffer.length)
                    this.flush();
            }

            return;
        }

        for (let i = offset, max = Math.min(chunk.length, offset+length); i < max; ++i)
            this.write(8, chunk[i]);
    }

    private min(a : bigint, b : bigint) {
        if (a < b)
            return a;
        else
            return b;
    }

    /**
     * Write the given number to the bitstream with the given bitlength. If the number is too large for the 
     * number of bits specified, the lower-order bits are written and the higher-order bits are ignored.
     * @param length The number of bits to write
     * @param value The number to write
     */
    write(length : number, value : number) {
        if (value === void 0 || value === null)
            value = 0;
        
        value = Number(value);

        if (Number.isNaN(value))
            throw new Error(`Cannot write to bitstream: Value ${value} is not a number`);
        if (!Number.isFinite(value))
            throw new Error(`Cannot write to bitstream: Value ${value} must be finite`);

        let valueN = BigInt(value % Math.pow(2, length));
        
        let remainingLength = length;

        while (remainingLength > 0) {
            let shift = BigInt(8 - this.pendingBits - remainingLength);
            let contribution = (shift >= 0 ? (valueN << shift) : (valueN >> -shift));
            let writtenLength = Number(shift >= 0 ? remainingLength : this.min(-shift, BigInt(8 - this.pendingBits)));

            this.pendingByte = this.pendingByte | contribution;
            this.pendingBits += writtenLength;
            this._offset += writtenLength;
            
            remainingLength -= writtenLength;
            valueN = valueN % BigInt(Math.pow(2, remainingLength));

            if (this.pendingBits === 8) {
                this.finishByte();

                if (this.bufferedBytes >= this.buffer.length) {
                    this.flush();
                }
            }
        }
    }

    writeSigned(length : number, value : number) {
        if (value === undefined || value === null)
            value = 0;
        
        const originalValue = value;
        const max = 2**(length - 1) - 1; // ie 127
        const min = -(2**(length - 1)); // ie -128

        value = Number(value);

        if (Number.isNaN(value))
            throw new Error(`Cannot write to bitstream: Value ${originalValue} is not a number`);
        if (!Number.isFinite(value))
            throw new Error(`Cannot write to bitstream: Value ${value} must be finite`);
        if (value > max)
            throw new TypeError(`Cannot represent ${value} in I${length} format: Value too large (min=${min}, max=${max})`);
        if (value < min)
            throw new TypeError(`Cannot represent ${value} in I${length} format: Negative value too small (min=${min}, max=${max})`);
        
        return this.write(length, value >= 0 ? value : (~(-value) + 1) >>> 0);
    }

    writeFloat(length : number, value : number) {
        if (length !== 32 && length !== 64)
            throw new TypeError(`Invalid length (${length} bits) Only 4-byte (32 bit / single-precision) and 8-byte (64 bit / double-precision) IEEE 754 values are supported`);
        
        let buf = new ArrayBuffer(length / 8);
        let view = new DataView(buf);

        if (length === 32)
            view.setFloat32(0, value);
        else if (length === 64)
            view.setFloat64(0, value);

        for (let i = 0, max = buf.byteLength; i < max; ++i)
            this.write(8, view.getUint8(i));
    }
}

/**
 * A specialized BitstreamWriter which does not write to a stream, but instead measures the number of 
 * bits written by the caller. This is used to implement measurement in BitstreamElement
 */
export class BitstreamMeasurer extends BitstreamWriter {
    constructor() {
        super(null, 1);
    }

    bitLength = 0;

    writeString(byteCount : number, value : string, encoding : string = 'utf-8') {
        this.bitLength += byteCount * 8;
    }

    writeBuffer(buffer : Uint8Array) {
        this.bitLength += buffer.length * 8;
    }

    write(length : number, value : number) {
        this.bitLength += length;
    }
}

