import { expect } from "chai";
import { describe } from "razmin";
import { BitstreamReader } from "./reader";

describe('BitstreamReader', it => {
    it('works', () => {
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
        expect(bitstream.readSync(4)).to.equal(0b1000);

        expect(bitstream.readSync(2)).to.equal(0b01);
        expect(bitstream.readSync(5)).to.equal(0b01010);
        expect(bitstream.readSync(1)).to.equal(0b0);

        expect(bitstream.readSync(8)).to.equal(0b11101001);

        expect(bitstream.readSync(11)).to.equal(0b01100100100);
        expect(bitstream.readSync(5)).to.equal(0b01110);
    })
});