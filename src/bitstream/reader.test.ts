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

    it('correctly handles signed integers', () => {
        let bitstream = new BitstreamReader();
        
        bitstream.addBuffer(Buffer.from([ 0xFB ])); expect(bitstream.readSignedSync(8)).to.equal(-5);
        bitstream.addBuffer(Buffer.from([ 5 ])); expect(bitstream.readSignedSync(8)).to.equal(5);
        bitstream.addBuffer(Buffer.from([ 0 ])); expect(bitstream.readSignedSync(8)).to.equal(0);

        bitstream.addBuffer(Buffer.from([ 0xFC, 0x0A ])); expect(bitstream.readSignedSync(16)).to.equal(-1014);
        bitstream.addBuffer(Buffer.from([ 0x03, 0xF6 ])); expect(bitstream.readSignedSync(16)).to.equal(1014);
        bitstream.addBuffer(Buffer.from([ 0, 0 ])); expect(bitstream.readSignedSync(16)).to.equal(0);

        bitstream.addBuffer(Buffer.from([ 0xFF, 0xFE, 0x70, 0x40 ])); expect(bitstream.readSignedSync(32)).to.equal(-102336);
        bitstream.addBuffer(Buffer.from([ 0x00, 0x01, 0x8F, 0xC0 ])); expect(bitstream.readSignedSync(32)).to.equal(102336);
        bitstream.addBuffer(Buffer.from([ 0, 0, 0, 0 ])); expect(bitstream.readSignedSync(32)).to.equal(0);
    });

    it('correctly handles floats', () => {
        let bitstream = new BitstreamReader();
        bitstream.addBuffer(Buffer.from([ 0x42, 0xCD, 0x00, 0x00 ])); expect(bitstream.readFloatSync(32)).to.equal(102.5);
        bitstream.addBuffer(Buffer.from([ 0xC3, 0xDA, 0x00, 0x00 ])); expect(bitstream.readFloatSync(32)).to.equal(-436);
        bitstream.addBuffer(Buffer.from([ 0, 0, 0, 0 ])); expect(bitstream.readFloatSync(32)).to.equal(0);
        
        bitstream.addBuffer(Buffer.from([ 0x41, 0x60, 0xae, 0x29, 0x71, 0xeb, 0x85, 0x1f ])); 
        expect(bitstream.readFloatSync(64)).to.equal(8745291.56);

        bitstream.addBuffer(Buffer.from([ 0xc1, 0x14, 0x00, 0xa4, 0xae, 0x14, 0x7a, 0xe1 ])); 
        expect(bitstream.readFloatSync(64)).to.equal(-327721.17);

        bitstream.addBuffer(Buffer.from([ 0, 0, 0, 0, 0, 0, 0, 0 ])); 
        expect(bitstream.readSignedSync(64)).to.equal(0);
    });

    it('correctly handles NaN', () => {
        let bitstream = new BitstreamReader();
        bitstream.addBuffer(Buffer.from([ 0x7F, 0xC0, 0x00, 0x00 ])); expect(bitstream.readFloatSync(32)).to.be.NaN;
        
        bitstream.addBuffer(Buffer.from([ 0x7f, 0xf8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ])); 
        expect(bitstream.readFloatSync(64)).to.be.NaN;
    });

    it('correctly handles Infinity', () => {
        let bitstream = new BitstreamReader();
        bitstream.addBuffer(Buffer.from([ 0x7f, 0x80, 0x00, 0x00 ])); 
        expect(bitstream.readFloatSync(32)).not.to.be.finite;
        
        bitstream.addBuffer(Buffer.from([ 0x7f, 0xf0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ])); 
        expect(bitstream.readFloatSync(64)).not.to.be.finite;
    });
});