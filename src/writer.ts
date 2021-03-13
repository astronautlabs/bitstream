import { Writable } from "stream";

export class BitstreamWriter {
    constructor(readonly stream : Writable, readonly bufferSize = 1) {
        this.buffer = Buffer.alloc(bufferSize);
    }

    private pendingByte : number;
    private pendingBits : number = 0;
    private buffer : Buffer;
    private bufferedBytes = 0;

    writeString(byteCount : number, value : string, encoding : string = 'utf-8') {
        let buffer = Buffer.alloc(byteCount);
        Buffer.from(value, <any>encoding).copy(buffer);
        this.writeBuffer(buffer);
    }

    writeBuffer(buffer : Buffer) {
        for (let i = 0, max = buffer.length; i < max; ++i)
            this.write(8, buffer[i]);
    }

    write(length : number, value : number) {
        value = value % Math.pow(2, length);
        
        let remainingLength = length;

        while (remainingLength > 0) {
            let shift = 8 - this.pendingBits - remainingLength;
            let contribution = (shift >= 0 ? (value << shift) : (value >> -shift));
            let writtenLength = shift >= 0 ? remainingLength : Math.min(-shift, 8 - this.pendingBits);

            this.pendingByte = this.pendingByte | contribution;
            this.pendingBits += writtenLength;
            
            remainingLength -= writtenLength;
            value = value % Math.pow(2, remainingLength);

            if (this.pendingBits === 8) {
                this.buffer[this.bufferedBytes++] = this.pendingByte;
                this.pendingBits = 0;
                this.pendingByte = 0;

                if (this.bufferedBytes >= this.buffer.length) {
                    this.stream.write(this.buffer); // TODO: callback
                    this.buffer = Buffer.alloc(this.bufferSize);
                    this.bufferedBytes = 0;
                }
            }
        }
    }
}

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

