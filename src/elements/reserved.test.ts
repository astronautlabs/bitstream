import { expect } from "chai";
import { describe } from "razmin";
import { BitstreamElement } from "./element";
import { Field } from "./field";
import { Reserved } from "./reserved";

describe('@Reserved()', it => {
    it('always writes high bits', () => {
        class CustomElement extends BitstreamElement {
            @Field(8) a : number;
            @Reserved(8) reserved : number;
            @Field(8) b : number;
        }

        let buf = new CustomElement().with({ a: 123, reserved: 111, b: 122 }).serialize();

        expect(Array.from(buf)).to.eql([ 123, 255, 122]);
    });
    it('is never read', () => {
        class CustomElement extends BitstreamElement {
            @Field(8) a : number;
            @Reserved(8) reserved : number;
            @Field(8) b : number;
        }

        let element = CustomElement.deserialize(Buffer.from([ 123, 111, 122 ]));

        expect(element.a).to.equal(123);
        expect(element.reserved).to.be.undefined;
        expect(element.b).to.equal(122);
    });
});