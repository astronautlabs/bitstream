import { Writable } from "./writable";

export class BufferedWritable implements Writable {
    buffer : Buffer = Buffer.alloc(0);
    write(chunk : Buffer) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
    };
}
