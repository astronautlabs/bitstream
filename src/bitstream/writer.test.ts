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
    });
    it('throws when writing NaN as an unsigned integer', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 2);

        try {
            writer.write(8, NaN);
            throw new Error(`Expected write(8, NaN) to throw an exception`);
        } catch (e) { }
    });
    it('throws when writing Infinity as an unsigned integer', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 2);

        try {
            writer.write(8, Infinity);
            throw new Error(`Expected write(8, Infinity) to throw an exception`);
        } catch (e) { }
    });
    it('throws when writing NaN as a signed integer', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 2);

        try {
            writer.writeSigned(8, NaN);
            throw new Error(`Expected write(8, NaN) to throw an exception`);
        } catch (e) { }
    });
    it('throws when writing values outside of range', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 2);

        writer.writeSigned(8, 0);
        writer.writeSigned(8, 127);
        writer.writeSigned(8, -128);

        try {
            writer.writeSigned(8, 200);
            throw new Error(`Expected writeSigned(8, 200) to throw an exception`);
        } catch (e) { }
        try {
            writer.writeSigned(8, 128);
            throw new Error(`Expected writeSigned(8, 128) to throw an exception`);
        } catch (e) { }
        try {
            writer.writeSigned(8, -129);
            throw new Error(`Expected writeSigned(8, -129) to throw an exception`);
        } catch (e) { }

        
        try {
            writer.writeSigned(16, 999999);
            throw new Error(`Expected writeSigned(8, 200) to throw an exception`);
        } catch (e) { }
        try {
            writer.writeSigned(16, -999999);
            throw new Error(`Expected writeSigned(8, 128) to throw an exception`);
        } catch (e) { }
    });
    it('throws when writing Infinity as a signed integer', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 2);

        try {
            writer.writeSigned(8, Infinity);
            throw new Error(`Expected write(8, Infinity) to throw an exception`);
        } catch (e) { }
    });
    it('writes undefined as zero when unsigned', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 1);

        writer.write(8, undefined);
        expect(bufs[0][0]).to.equal(0);
    });
    it('writes null as zero when unsigned', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 1);

        writer.write(8, null);
        expect(bufs[0][0]).to.equal(0);
    });
    it('writes undefined as zero when signed', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 1);

        writer.writeSigned(8, undefined);
        expect(bufs[0][0]).to.equal(0);
    });
    it('writes null as zero when signed', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 1);

        writer.writeSigned(8, null);
        expect(bufs[0][0]).to.equal(0);
    });
    it('correctly handles signed integers', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream);

        writer.writeSigned(8, -5); expect(bufs[0][0]).to.equal(0xFB);
        writer.writeSigned(8, 5); expect(bufs[1][0]).to.equal(5);
        writer.writeSigned(8, 0); expect(bufs[2][0]).to.equal(0);

        bufs = [];
        writer = new BitstreamWriter(fakeStream, 2);

        writer.writeSigned(16, -1014); expect(Array.from(bufs[0])).to.eql([0xFC, 0x0A]);
        writer.writeSigned(16, 1014); expect(Array.from(bufs[1])).to.eql([0x03, 0xF6]);
        writer.writeSigned(16, 0); expect(Array.from(bufs[2])).to.eql([0, 0]);

        bufs = [];
        writer = new BitstreamWriter(fakeStream, 4);

        writer.writeSigned(32, -102336); expect(Array.from(bufs[0])).to.eql([0xFF, 0xFE, 0x70, 0x40]);
        writer.writeSigned(32, 102336); expect(Array.from(bufs[1])).to.eql([0x00, 0x01, 0x8F, 0xC0]);
        writer.writeSigned(32, 0); expect(Array.from(bufs[2])).to.eql([0, 0, 0, 0]);

    });
    it('correctly handles floats', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 4);

        writer.writeFloat(32, 102.5); expect(Array.from(bufs[0])).to.eql([0x42, 0xCD, 0x00, 0x00]);
        writer.writeFloat(32, -436); expect(Array.from(bufs[1])).to.eql([0xC3, 0xDA, 0x00, 0x00]);
        writer.writeFloat(32, 0); expect(Array.from(bufs[2])).to.eql([0,0,0,0]);

        bufs = [];
        writer = new BitstreamWriter(fakeStream, 8);

        writer.writeFloat(64, 8745291.56);
        expect(Array.from(bufs[0])).to.eql([0x41, 0x60, 0xae, 0x29, 0x71, 0xeb, 0x85, 0x1f]);

        writer.writeFloat(64, -327721.17);
        expect(Array.from(bufs[1])).to.eql([0xc1, 0x14, 0x00, 0xa4, 0xae, 0x14, 0x7a, 0xe1]);

        writer.writeFloat(64, 0);
        expect(Array.from(bufs[2])).to.eql([0, 0, 0, 0, 0, 0, 0, 0]);
    });

    it('.writeFloat() throws for lengths other than 32 and 64', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 4);

        try {
            writer.writeFloat(13, 123);
            throw new Error(`Expected error`);
        } catch (e) { }
    });

    it('correctly handles NaN', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 4);

        writer.writeFloat(32, NaN); expect(Array.from(bufs[0])).to.eql([0x7F, 0xC0, 0x00, 0x00]);
        
        bufs = [];
        writer = new BitstreamWriter(fakeStream, 8);

        writer.writeFloat(64, NaN); 
        expect(Array.from(bufs[0])).to.eql([ 0x7f, 0xf8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]);
    });

    it('correctly handles Infinity', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 4);

        writer.writeFloat(32, Infinity); expect(Array.from(bufs[0])).to.eql([ 0x7f, 0x80, 0x00, 0x00 ]);
        
        bufs = [];
        writer = new BitstreamWriter(fakeStream, 8);

        writer.writeFloat(64, Infinity); 
        expect(Array.from(bufs[0])).to.eql([ 0x7f, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]);
    });
    it('.end() flushes full bytes', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 4);

        writer.write(8, 44);
        expect(bufs.length).to.equal(0);
        writer.end();
        expect(bufs.length).to.equal(1);
        expect(bufs[0].length).to.equal(4);
        expect(bufs[0][0]).to.equal(44);
        expect(bufs[0][1]).to.equal(0);
        expect(bufs[0][2]).to.equal(0);
        expect(bufs[0][3]).to.equal(0);
    });
    it('.end() flushes partial bytes', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 4);

        writer.write(4, 0b1111);
        expect(bufs.length).to.equal(0);
        writer.end();
        expect(bufs.length).to.equal(1);
        expect(bufs[0].length).to.equal(4);
        expect(bufs[0][0]).to.equal(0b11110000);
        expect(bufs[0][1]).to.equal(0);
        expect(bufs[0][2]).to.equal(0);
        expect(bufs[0][3]).to.equal(0);
    });
    it('.writeString() writes utf-8 strings correctly', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 5);

        writer.writeString(5, 'hello', 'utf-8');
        expect(bufs.length).to.equal(1);

        let buf = Buffer.from(bufs[0]);

        expect(buf.length).to.equal(5);
        expect(buf.toString('utf-8')).to.equal('hello');
    });
    it('.writeString() writes utf16le strings correctly', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 10);

        writer.writeString(10, 'hello', 'utf16le');

        let buf = Buffer.from(bufs[0]);

        expect(buf.toString('utf16le')).to.equal('hello');
    });
    it('.writeString() throws when any encoding other than utf-8 is used and Buffer is not available', () => {
        const BufferT = Buffer;
        (globalThis as any).Buffer = undefined;

        try {
            let bufs : Buffer[] = [];
            let fakeStream : any = { write(buf) { bufs.push(buf); } }
            let writer = new BitstreamWriter(fakeStream, 10);

            try {
                writer.writeString(10, 'hello', 'utf16le');
                throw new Error(`Expected throw`);
            } catch (e) { }
        } finally {
            (globalThis as any).Buffer = BufferT;
        }
    });
    it('.writeBuffer() works correctly', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 2);

        let buf = Buffer.from([ 12, 34, 56, 78 ]);
        writer.writeBuffer(buf);

        expect(bufs.length).to.equal(2);
        expect(bufs[0][0]).to.equal(12);
        expect(bufs[0][1]).to.equal(34);
        expect(bufs[1][0]).to.equal(56);
        expect(bufs[1][1]).to.equal(78);
    });
    it('.writeBuffer() works even when not byte-aligned', () => {
        let bufs : Buffer[] = [];
        let fakeStream : any = { write(buf) { bufs.push(buf); } }
        let writer = new BitstreamWriter(fakeStream, 5);

        let buf = Buffer.from([ 12, 34, 56, 78 ]);
        writer.write(4, 0);
        writer.writeBuffer(buf);
        writer.write(4, 0);

        expect(bufs.length).to.equal(1);
        expect(bufs[0].length).to.equal(5);
        expect(bufs[0][0]).to.equal(0);
        expect(bufs[0][1]).to.equal(194);
        expect(bufs[0][2]).to.equal(35);
        expect(bufs[0][3]).to.equal(132);
        expect(bufs[0][4]).to.equal(224);
    });
});