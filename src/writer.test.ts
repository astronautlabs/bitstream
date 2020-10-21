import { describe } from "razmin";
import { expect } from "chai";
import { BitstreamWriter } from "./writer";

describe('BitstreamWriter', it => {
    it('works for bit writes', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream);
        writer.write(1, 0b1);
        writer.write(1, 0b0);
        writer.write(1, 0b0);
        writer.write(1, 0b1);
        writer.write(1, 0b1);
        writer.write(1, 0b0);
        writer.write(1, 0b0);
        writer.write(1, 0b1);
        writer.write(1, 0b0);
        writer.write(1, 0b1);
        writer.write(1, 0b1);
        writer.write(1, 0b0);
        writer.write(1, 0b0);
        writer.write(1, 0b1);
        writer.write(1, 0b1);
        writer.write(1, 0b0);
        expect(bufs.length).to.equal(2);
        expect(bufs[0][0]).to.equal(0b10011001);
        expect(bufs[1][0]).to.equal(0b01100110);
    });
    it('works for short writes', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream);
        writer.write(3, 0b010);
        writer.write(3, 0b101);
        writer.write(2, 0b11);
        expect(bufs.length).to.equal(1);
        expect(bufs[0][0]).to.equal(0b01010111);
    });
    it('works for full-byte writes', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream);
        writer.write(8, 0b01010111);
        expect(bufs.length).to.equal(1);
        expect(bufs[0][0]).to.equal(0b01010111);
    });
    it('works for offset full-byte writes', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream);
        writer.write(4, 0b1111);
        writer.write(8, 0b01010111);
        writer.write(4, 0b1111);
        expect(bufs.length).to.equal(2);
        expect(bufs[0][0]).to.equal(0b11110101);
        expect(bufs[1][0]).to.equal(0b01111111);
    });
    it('works for large writes (1)', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream);
        writer.write(16, 0b1111111100000000);
        expect(bufs.length).to.equal(2);
        expect(bufs[0][0]).to.equal(0b11111111);
        expect(bufs[1][0]).to.equal(0b00000000);
    });
    it('works for large writes (2)', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream);
        writer.write(16, 0b0101010110101010);
        expect(bufs.length).to.equal(2);
        expect(bufs[0][0]).to.equal(0b01010101);
        expect(bufs[1][0]).to.equal(0b10101010);
    });
    it('works for offset large writes', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream);
        writer.write(4, 0b1111);
        writer.write(16, 0b0101010110101010);
        writer.write(4, 0b1111);

        expect(bufs.length).to.equal(3);
        expect(bufs[0][0]).to.equal(0b11110101);
        expect(bufs[1][0]).to.equal(0b01011010);
        expect(bufs[2][0]).to.equal(0b10101111);
    });
    it('respects configured buffer size', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 2);
        writer.write(8, 0b11111100);
        expect(bufs.length).to.equal(0);
        writer.write(8, 0b11111101);
        expect(bufs.length).to.equal(1);
        writer.write(8, 0b11111110);
        expect(bufs.length).to.equal(1);
        writer.write(8, 0b11111111);
        expect(bufs.length).to.equal(2);

        expect(bufs[0].length).to.equal(2);
        expect(bufs[1].length).to.equal(2);
        expect(bufs[0][0]).to.equal(0b11111100);
        expect(bufs[0][1]).to.equal(0b11111101);
        expect(bufs[1][0]).to.equal(0b11111110);
        expect(bufs[1][1]).to.equal(0b11111111);

    })
});