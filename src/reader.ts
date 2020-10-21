import { Transform } from "stream";

export interface BitstreamRequest {
    resolve : (buffer : number) => void;
    length : number;
}

export class BitstreamReader {
    private buffers : Buffer[] = [];
    private bufferedLength : number = 0;
    private blockedRequests : BitstreamRequest[] = [];
    private offset = 0;

    available(length : number) {
        return this.bufferedLength >= length;
    }

    readSync(length : number) {
        let value = 0;
        let remainingLength = length;

        if (this.buffers.length === 0 || this.bufferedLength < length)
            throw new Error(`Not enough bits are available (read=${length}, buffered=${this.bufferedLength})`);
        
        while (remainingLength > 0) {
            let buffer = this.buffers[0];

            let byte = buffer[Math.floor(this.offset / 8)];
            
            let bitOffset = this.offset % 8;
            let bitContribution = Math.min(8 - bitOffset, remainingLength);
            let mask = Math.pow(0x2, bitContribution) - 1;            
            value = (value << bitContribution) | ((byte >> (8 - bitContribution - bitOffset)) & mask);

            // update counters

            this.offset += bitContribution;
            this.bufferedLength -= bitContribution;
            remainingLength -= bitContribution;

            if (this.offset >= buffer.length*8) {
                this.buffers.shift();
            }
        }

        return value;
    }

    read(length : number) : Promise<number> {
        if (this.bufferedLength >= length) {
            return Promise.resolve(this.readSync(length));
        } else {
            let request : BitstreamRequest = { resolve: null, length };
            let promise = new Promise<number>(resolve => request.resolve = resolve);
            this.blockedRequests.push(request);
            return promise;
        }
    }

    protected unread(buffer : Buffer) {
        this.buffers.unshift(buffer);
    }
    
    addBuffer(buffer : Buffer) {
        this.buffers.push(buffer);
        this.bufferedLength += buffer.length * 8;
    }
}
