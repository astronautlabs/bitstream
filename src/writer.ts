import { Writable } from "stream";

export class BitstreamWriter {
    constructor(readonly stream : Writable, readonly bufferSize = 1) {
        this.buffer = Buffer.alloc(bufferSize);
    }

    private pendingByte : bigint = BigInt(0);
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

    private min(a : bigint, b : bigint) {
        if (a < b)
            return a;
        else
            return b;
    }

    write(length : number, valueX : number) {
        if (isNaN(valueX))
            throw new Error(`Cannot write to bitstream: Value ${valueX} is not a number`);
        
        let valueN = BigInt(valueX % Math.pow(2, length));
        
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

