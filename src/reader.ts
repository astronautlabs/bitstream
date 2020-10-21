import { Transform } from "stream";

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

    available(length : number) {
        return this.bufferedLength >= length;
    }

    readSync(length : number) {
        if (this.blockedRequest)
            throw new Error(`Only one read() can be outstanding at a time.`);
        
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

    assure(length : number) : Promise<void> {
        if (this.blockedRequest)
            throw new Error(`Only one read()/assure() can be outstanding at a time.`);

        if (this.bufferedLength >= length) {
            return Promise.resolve();
        }

        let request : BitstreamRequest = { resolve: null, length, peek: true };
        let promise = new Promise<number>(resolve => request.resolve = resolve);
        this.blockedRequest = request;
        return promise.then(() => {});
    }

    read(length : number) : Promise<number> {
        if (this.blockedRequest)
            throw new Error(`Only one read()/assure() can be outstanding at a time.`);
        
        if (this.bufferedLength >= length) {
            return Promise.resolve(this.readSync(length));
        } else {
            let request : BitstreamRequest = { resolve: null, length, peek: false };
            let promise = new Promise<number>(resolve => request.resolve = resolve);
            this.blockedRequest = request;
            return promise;
        }
    }

    protected unread(buffer : Buffer) {
        this.buffers.unshift(buffer);
    }
    
    addBuffer(buffer : Buffer) {
        this.buffers.push(buffer);
        this.bufferedLength += buffer.length * 8;

        if (this.blockedRequest && this.blockedRequest.length <= this.bufferedLength) {
            this.blockedRequest = null;
            if (this.blockedRequest.peek) {
                this.blockedRequest.resolve(0);
            } else {
                return this.readSync(this.blockedRequest.length);
            }
        }
    }
}
