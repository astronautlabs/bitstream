import { Writable } from "stream";

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
    constructor(readonly stream : Writable, readonly bufferSize = 1) {
        this.buffer = Buffer.alloc(bufferSize);
    }

    private pendingByte : bigint = BigInt(0);
    private pendingBits : number = 0;
    private buffer : Buffer;
    private bufferedBytes = 0;

    /**
     * Decode a string into a set of bytes and write it to the bitstream, bounding the string
     * by the given number of bytes, optionally using the given encoding (or UTF-8 if not specified).
     * @param byteCount The number of bytes to bound the output to
     * @param value The string to decode and write
     * @param encoding The encoding to use when writing the string. Defaults to utf-8
     */
    writeString(byteCount : number, value : string, encoding : string = 'utf-8') {
        let buffer = Buffer.alloc(byteCount);
        Buffer.from(value, <any>encoding).copy(buffer);
        this.writeBuffer(buffer);
    }

    /**
     * Write the given buffer to the bitstream. This is done by treating each byte as an 8-bit write.
     * Note that the bitstream does not need to be byte-aligned to call this method, meaning you can write 
     * a set of bytes at a non=zero bit offset if you wish.
     * @param buffer The buffer to write
     */
    writeBuffer(buffer : Buffer) {
        for (let i = 0, max = buffer.length; i < max; ++i)
            this.write(8, buffer[i]);
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
        if (isNaN(value))
            throw new Error(`Cannot write to bitstream: Value ${value} is not a number`);
        
        let valueN = BigInt(value % Math.pow(2, length));
        
        let remainingLength = length;

        while (remainingLength > 0) {
            let shift = BigInt(8 - this.pendingBits - remainingLength);
            let contribution = (shift >= 0 ? (valueN << shift) : (valueN >> -shift));
            let writtenLength = Number(shift >= 0 ? remainingLength : this.min(-shift, BigInt(8 - this.pendingBits)));

            this.pendingByte = this.pendingByte | contribution;
            this.pendingBits += writtenLength;
            
            remainingLength -= writtenLength;
            valueN = valueN % BigInt(Math.pow(2, remainingLength));

            if (this.pendingBits === 8) {
                this.buffer[this.bufferedBytes++] = Number(this.pendingByte);
                this.pendingBits = 0;
                this.pendingByte = BigInt(0);

                if (this.bufferedBytes >= this.buffer.length) {
                    this.stream.write(this.buffer); // TODO: callback
                    this.buffer = Buffer.alloc(this.bufferSize);
                    this.bufferedBytes = 0;
                }
            }
        }
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

    writeBuffer(buffer : Buffer) {
        this.bitLength += buffer.length * 8;
    }

    write(length : number, value : number) {
        this.bitLength += length;
    }
}
