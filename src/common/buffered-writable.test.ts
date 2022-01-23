import { expect } from "chai";
import { describe, it } from "razmin";
import { BufferedWritable } from "./buffered-writable";

describe('BufferedWritable', () => {
    it('appends written data onto its buffer', () => {
        let writable = new BufferedWritable();
        expect(writable.buffer.length).to.equal(0);
        writable.write(Buffer.alloc(3));
        expect(writable.buffer.length).to.equal(3);
        writable.write(Buffer.alloc(20));
        expect(writable.buffer.length).to.equal(23);
    });
});