import { expect } from "chai";
import { describe } from "razmin";
import { BitstreamReader } from "./reader";

describe('BitstreamReader', it => {
    it('can read a byte-aligned byte', () => {
        let bitstream = new BitstreamReader();
        bitstream.addBuffer(Buffer.from([ 123 ]));

        expect(bitstream.readSync(8)).to.equal(123);
    });

    it('can correctly deserialize a simple example from a single buffer', () => {
        let bitstream = new BitstreamReader();

        bitstream.addBuffer(Buffer.from([
            0b11001000,
            0b01010100,
            0b11101001,

            0b01100100,
            0b10001110
        ]));

        expect(bitstream.readSync(1)).to.equal(0b1);
        expect(bitstream.readSync(3)).to.equal(0b100);
        expect(bitstream.readSync(5)).to.equal(0b10000);

        expect(bitstream.readSync(1)).to.equal(0b1);
        expect(bitstream.readSync(5)).to.equal(0b01010);
        expect(bitstream.readSync(1)).to.equal(0b0);

        expect(bitstream.readSync(8)).to.equal(0b11101001);

        expect(bitstream.readSync(11)).to.equal(0b01100100100);
        expect(bitstream.readSync(5)).to.equal(0b01110);
    });
    it('can correctly deserialize a simple example from multiple buffers', () => {
        let bitstream = new BitstreamReader();

        bitstream.addBuffer(Buffer.from([ 0b11001000, 0b01010100 ]));
        bitstream.addBuffer(Buffer.from([ 0b11101001, 0b01100100, 0b10001110 ]));

        expect(bitstream.readSync(1)).to.equal(0b1);
        expect(bitstream.readSync(3)).to.equal(0b100);
        expect(bitstream.readSync(4)).to.equal(0b1000);

        expect(bitstream.readSync(2)).to.equal(0b01);
        expect(bitstream.readSync(5)).to.equal(0b01010);
        expect(bitstream.readSync(2)).to.equal(0b01);

        expect(bitstream.readSync(7)).to.equal(0b1101001);

        expect(bitstream.readSync(11)).to.equal(0b01100100100);
        expect(bitstream.readSync(5)).to.equal(0b01110);
    });

    it('can read fixed length UTF-8 strings', () => {
        let bitstream = new BitstreamReader();
        bitstream.addBuffer(Buffer.from('hello', 'utf-8'));
        let str = bitstream.readStringSync(5);
        expect(str).to.equal('hello');
    });

    it('can read null-terminated fixed length UTF-8 strings', () => {
        let bitstream = new BitstreamReader();
        let buf = Buffer.alloc(5, 0);
        Buffer.from('hi', 'utf-8').copy(buf);

        bitstream.addBuffer(buf);
        let str = bitstream.readStringSync(5);
        expect(str).to.equal('hi');
    });

    it('respects nullTerminated=false when reading strings', () => {
        let bitstream = new BitstreamReader();
        let buf = Buffer.alloc(5, 0);
        Buffer.from('hi', 'utf-8').copy(buf);

        bitstream.addBuffer(buf);
        let str = bitstream.readStringSync(5, { nullTerminated: false });
        expect(str).to.equal('hi\u0000\u0000\u0000');
    });

    it('correctly handles intra-byte skips', () => {
        let bitstream = new BitstreamReader();

        bitstream.addBuffer(Buffer.from([ 0b11001010, 0b01010100 ]));
        bitstream.addBuffer(Buffer.from([ 0b11101001, 0b01100100, 0b10001110 ]));

        expect(bitstream.readSync(1)).to.equal(0b1);
        expect(bitstream.readSync(3)).to.equal(0b100);
        bitstream.skip(1);
        expect(bitstream.readSync(3)).to.equal(0b010);

        bitstream.skip(2);
        expect(bitstream.readSync(5)).to.equal(0b01010);
        expect(bitstream.readSync(2)).to.equal(0b01);

        bitstream.skip(1);
        expect(bitstream.readSync(6)).to.equal(0b101001);

        expect(bitstream.readSync(10)).to.equal(0b0110010010);
        bitstream.skip(1);
        expect(bitstream.readSync(5)).to.equal(0b01110);
    });
    it('correctly handles inter-byte skips', () => {
        let bitstream = new BitstreamReader();

        bitstream.addBuffer(Buffer.from([ 0b11001010, 0b01010100 ]));
        bitstream.addBuffer(Buffer.from([ 0b11101001, 0b01100100, 0b10001110 ]));

        expect(bitstream.readSync(1)).to.equal(0b1);
        expect(bitstream.readSync(3)).to.equal(0b100);
        bitstream.skip(1);
        expect(bitstream.readSync(1)).to.equal(0b0);

        bitstream.skip(4);
        expect(bitstream.readSync(5)).to.equal(0b01010);
        expect(bitstream.readSync(2)).to.equal(0b01);

        bitstream.skip(1);
        expect(bitstream.readSync(6)).to.equal(0b101001);

        expect(bitstream.readSync(10)).to.equal(0b0110010010);
        bitstream.skip(1);
        expect(bitstream.readSync(5)).to.equal(0b01110);
    });
    it('correctly handles large inter-byte skips', () => {
        let bitstream = new BitstreamReader();

        bitstream.addBuffer(Buffer.from([ 0b11001010, 0b01010100 ]));
        bitstream.addBuffer(Buffer.from([ 0b11101001, 0b01100100, 0b10001110 ]));

        expect(bitstream.readSync(1)).to.equal(0b1);
        expect(bitstream.readSync(3)).to.equal(0b100);
        bitstream.skip(14);
        expect(bitstream.readSync(6)).to.equal(0b101001);
        expect(bitstream.readSync(10)).to.equal(0b0110010010);
        bitstream.skip(1);
        expect(bitstream.readSync(5)).to.equal(0b01110);
    });
    it('peeks correctly', () => {
        let bitstream = new BitstreamReader();

        bitstream.addBuffer(Buffer.from([ 0b11001010, 0b01010100 ]));

        expect(bitstream.peekSync(4)).to.equal(0b1100);
        expect(bitstream.readSync(1)).to.equal(0b1);
        expect(bitstream.readSync(3)).to.equal(0b100);
        expect(bitstream.peekSync(8)).to.equal(0b10100101);
        expect(bitstream.readSync(1)).to.equal(0b1);
        expect(bitstream.readSync(3)).to.equal(0b010);
        expect(bitstream.peekSync(2)).to.equal(0b01);
        expect(bitstream.readSync(4)).to.equal(0b0101);
        expect(bitstream.readSync(4)).to.equal(0b0100);
    });
});