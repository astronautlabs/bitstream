import { Writable } from "./writable";

export class BufferedWritable implements Writable {
    buffer : Uint8Array = new Uint8Array(0);
    write(chunk : Uint8Array) {
        let buf = new Uint8Array(this.buffer.length + chunk.length);
        buf.set(this.buffer);
        buf.set(chunk, this.buffer.length);
        this.buffer = buf;
    };
}
