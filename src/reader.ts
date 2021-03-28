import { Transform } from "stream";
import { Constructor } from "./constructor";
import { StringEncodingOptions } from "./string-encoding-options";

/**
 * Represents a request to read a number of bits
 */
export interface BitstreamRequest {
    resolve : (buffer : number) => void;
    length : number;
    peek : boolean;
}

/**
 * A class which lets you read through one or more Buffers bit-by-bit. All data is read in big-endian (network) byte 
 * order
 */
export class BitstreamReader {
    private buffers : Buffer[] = [];
    private bufferedLength : number = 0;
    private blockedRequest : BitstreamRequest = null;
    private offset = 0;

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

    /**
     * Asynchronously read the given number of bytes, encode it into a string, and return the result,
     * optionally using a specific text encoding.
     * @param length The number of bytes to read
     * @param options A set of options to control conversion into a string. @see StringEncodingOptions
     * @returns The resulting string
     */
    async readString(length : number, options? : StringEncodingOptions): Promise<string> {
        this.ensureNoReadPending();

        if (!options)
            options = {};
        
        let buffer = Buffer.alloc(length);
        let firstNullByte = -1;
        for (let i = 0, max = length; i < max; ++i) {
            buffer[i] = await this.read(8);
            if (buffer[i] === 0 && firstNullByte < 0)
                firstNullByte = i;
        }

        if (options.nullTerminated !== false) {
            if (firstNullByte >= 0) {
                buffer = buffer.subarray(0, firstNullByte);
            }
        }

        return buffer.toString(<any>options.encoding || 'utf-8');
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

        let buffer = Buffer.alloc(length);
        let firstNullByte = -1;
        for (let i = 0, max = length; i < max; ++i) {
            buffer[i] = this.readSync(8);
            if (buffer[i] === 0 && firstNullByte < 0)
                firstNullByte = i;
        }

        if (options.nullTerminated !== false) {
            if (firstNullByte >= 0) {
                buffer = buffer.subarray(0, firstNullByte);
            }
        }

        return buffer.toString(<any>options.encoding || 'utf-8');
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
     * Read a number of the given bitlength synchronously. If there are not enough 
     * bits available, an error is thrown.
     * @param length The number of bits to read
     * @returns The number read from the bitstream
     */
    readSync(length : number): number {
        return this.readCoreSync(length, true);
    }

    private readCoreSync(length : number, consume : boolean): number {
        this.ensureNoReadPending();
        
        let value : bigint = BigInt(0);
        let remainingLength = length;

        if (this.available < length)
            throw new Error(`underrun: Not enough bits are available (requested=${length}, available=${this.bufferedLength}, buffers=${this.buffers.length})`);
        
        this.adjustSkip();

        let offset = this.offset;
        let bufferIndex = 0;

        let bitLength = 0;

        while (remainingLength > 0) {
            let buffer = this.buffers[bufferIndex];
            let byte = BigInt(buffer[Math.floor(offset / 8)]);
            
            let bitOffset = offset % 8;
            let bitContribution = Math.min(8 - bitOffset, remainingLength);
            let mask = Math.pow(0x2, bitContribution) - 1;
            
            value = (value << BigInt(bitContribution)) | ((byte >> (BigInt(8) - BigInt(bitContribution) - BigInt(bitOffset))) & BigInt(mask));
            
            // update counters

            offset += bitContribution;
            remainingLength -= bitContribution;
            bitLength += bitContribution;

            if (offset >= buffer.length*8) {
                bufferIndex += 1;
                offset = 0;
            }
        }

        if (consume) {
            this.buffers.splice(0, bufferIndex);
            this.bufferedLength -= length;
            this.offset = offset;
        }

        return Number(value);
    }

    private adjustSkip() {
        if (this.skippedLength <= 0)
            return;
        
        // First, remove any buffers that are completely skipped
        while (this.buffers && this.skippedLength > this.buffers[0].length*8-this.offset) {
            this.skippedLength -= (this.buffers[0].length*8 - this.offset);
            this.offset = 0;
            this.buffers.shift();
        }

        // If any buffers are left, then the amount of remaining skipped bits is 
        // less than the full length of the buffer, so entirely consume the skipped length
        // by putting it into the offset.
        if (this.buffers.length > 0) {
            this.offset += this.skippedLength;
            this.skippedLength = 0;
        }
    }

    /**
     * Wait until the given number of bits is available
     * @param length The number of bits to wait for
     * @returns A promise which will resolve once the given number of bits is available
     */
    assure(length : number) : Promise<void> {
        this.ensureNoReadPending();

        if (this.bufferedLength >= length) {
            return Promise.resolve();
        }

        let request : BitstreamRequest = { resolve: null, length, peek: true };
        let promise = new Promise<number>(resolve => request.resolve = resolve);
        this.blockedRequest = request;
        return promise.then(() => {});
    }

    /**
     * Asynchronously read a number of the given bitlength. If there are not enough bits available
     * to complete the operation, the operation is delayed until enough bits become available
     * @param length The number of bits to read
     * @returns A promise which resolves with the number read from the bitstream
     */
    read(length : number) : Promise<number> {
        this.ensureNoReadPending();
        
        if (this.available >= length) {
            return Promise.resolve(this.readSync(length));
        } else {
            let request : BitstreamRequest = { resolve: null, length, peek: false };
            let promise = new Promise<number>(resolve => request.resolve = resolve);
            this.blockedRequest = request;
            return promise;
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
     * Add a buffer onto the end of the bitstream. Important: This method does not insert the data at the 
     * current read head, it places it at the end of the bitstream. 
     * @param buffer The buffer to add to the bitstream
     * @deprecated Use addBuffer() instead
     */
    unread(buffer : Buffer) {
        this.buffers.unshift(buffer);
    }
    
    /**
     * Add a buffer onto the end of the bitstream.
     * @param buffer The buffer to add to the bitstream
     */
    addBuffer(buffer : Buffer) {
        this.buffers.push(buffer);
        this.bufferedLength += buffer.length * 8;

        if (this.blockedRequest && this.blockedRequest.length <= this.available) {
            let request = this.blockedRequest;
            this.blockedRequest = null;

            if (request.peek) {
                request.resolve(0);
            } else {
                request.resolve(this.readSync(request.length));
            }
        }
    }
}
