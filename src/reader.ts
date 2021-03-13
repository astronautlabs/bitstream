import { Transform } from "stream";
import { Constructor } from "./constructor";
import { StringEncodingOptions } from "./string-encoding-options";

export interface BitstreamRequest {
    resolve : (buffer : number) => void;
    length : number;
    peek : boolean;
}

export class BitstreamReader {
    private buffers : Buffer[] = [];
    private bufferedLength : number = 0;
    private blockedRequest : BitstreamRequest = null;
    private offset = 0;

    get available() {
        return this.bufferedLength - this.skippedLength;
    }

    isAvailable(length : number) {
        return this.bufferedLength >= length;
    }

    private ensureNoReadPending() {
        if (this.blockedRequest)
            throw new Error(`Only one read() can be outstanding at a time.`);
    }

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

    peekSync(length : number) {
        return this.readCoreSync(length, false);
    }

    private skippedLength = 0;

    skip(length : number) {
        this.skippedLength += length;
    }
    
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

        //console.log(`Reading number of ${remainingLength} bits (initial byteOffset=${offset}, bitOffset=${offset % 8})...`);

        let bitLength = 0;

        while (remainingLength > 0) {
            let buffer = this.buffers[bufferIndex];
            let byte = BigInt(buffer[Math.floor(offset / 8)]);
            
            let bitOffset = offset % 8;
            let bitContribution = Math.min(8 - bitOffset, remainingLength);
            let mask = Math.pow(0x2, bitContribution) - 1;
            
            //console.log(` - Taking ${bitContribution} bits from current byte: 0b${((byte >> (BigInt(8) - BigInt(bitContribution) - BigInt(bitOffset))) & BigInt(mask)).toString(2)}`);
            //console.log(` - Making space for ${bitContribution} bits: 0b${(value << BigInt(bitContribution)).toString(2)}`);
            value = (value << BigInt(bitContribution)) | ((byte >> (BigInt(8) - BigInt(bitContribution) - BigInt(bitOffset))) & BigInt(mask));
            //console.log(` - Value is now: 0b${value.toString(2)}`);

            // update counters

            offset += bitContribution;
            remainingLength -= bitContribution;
            bitLength += bitContribution;

            if (offset >= buffer.length*8) {
                bufferIndex += 1;
                offset = 0;
            }
        }

        //console.log(` - Final value: 0b${value.toString(2)}`);
        
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

    async peek(length : number): Promise<number> {
        await this.assure(length);
        return this.peekSync(length);
    }

    unread(buffer : Buffer) {
        this.buffers.unshift(buffer);
    }
    
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
