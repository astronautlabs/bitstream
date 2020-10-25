import { expect } from "chai";
import { describe } from "razmin";
import { BitstreamElement } from "./element";
import { Field } from "./field";
import { BitstreamReader } from "./reader";

describe('BitstreamElement', it => {
    it('correctly deserializes a basic element in synchronous mode', () => {
        class ExampleElement extends BitstreamElement {
            @Field(2) a;
            @Field(3) b;
            @Field(4) c;
            @Field(5) d;
            @Field(6) e;
        }

        //            |-|--|---|----|-----X-----
        let value = 0b10010110101011000010000000000000;
        let buffer = Buffer.alloc(4);
        buffer.writeUInt32BE(value);

        let bitstream = new BitstreamReader();
        bitstream.addBuffer(buffer);

        let element = ExampleElement.deserializeSync(bitstream);

        expect(element.a).to.equal(0b10);
        expect(element.b).to.equal(0b010);
        expect(element.c).to.equal(0b1101);
        expect(element.d).to.equal(0b01011);
        expect(element.e).to.equal(0b000010);
    });

    it('correctly deserializes nested elements', () => {

        class PartElement extends BitstreamElement {
            @Field(3) c;
            @Field(4) d;
        }

        class WholeElement extends BitstreamElement {
            @Field(1) a;
            @Field(2) b;
            @Field(0) part : PartElement;
            @Field(5) e;
            @Field(6) f;
        }

        //            ||-|--|---|----|-----X-----
        let value = 0b11010110101011000010100000000000;
        let buffer = Buffer.alloc(4);
        buffer.writeUInt32BE(value);

        let bitstream = new BitstreamReader();
        bitstream.addBuffer(buffer);

        let element = WholeElement.deserializeSync(bitstream);

        expect(element.a)       .to.equal(0b1);
        expect(element.b)       .to.equal(0b10);
        expect(element.part.c)  .to.equal(0b101);
        expect(element.part.d)  .to.equal(0b1010);
        expect(element.e)       .to.equal(0b10110);
        expect(element.f)       .to.equal(0b000101);

    });
})