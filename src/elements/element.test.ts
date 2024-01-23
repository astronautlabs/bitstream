import { expect } from "chai";
import { describe } from "razmin";
import { Variant } from "./variant";
import { BitstreamReader, BitstreamWriter } from "../bitstream";
import { BitstreamElement } from "./element";
import { Field } from "./field";
import { BufferedWritable } from "../common";
import { DefaultVariant, Reserved, VariantMarker } from ".";

describe('BitstreamElement', it => {
    describe(': Casting', it => {
        it('as() allows correct casts', () => {
            class CustomElement extends BitstreamElement {}
            class ChildElement extends CustomElement {}
            let element : CustomElement = new ChildElement();
            expect(element.as(ChildElement)).to.equal(element);
        });
        it('as() throws on invalid casts', () => {
            class CustomElement extends BitstreamElement {}
            class ChildElement extends CustomElement {}
            let element : CustomElement = new CustomElement();
            let caught;

            try {
                element.as(ChildElement)
            } catch (e) {
                caught = e;
            }

            expect(caught).to.exist;
        });
        it('is() tells the truth', () => {
            class CustomElement extends BitstreamElement {}
            class ChildElement extends CustomElement {}
            let element : CustomElement = new ChildElement();
            
            expect(element.is(BitstreamElement)).to.be.true;
            expect(element.is(CustomElement)).to.be.true;
            expect(element.is(ChildElement)).to.be.true;

            element = new CustomElement();
            
            expect(element.is(BitstreamElement)).to.be.true;
            expect(element.is(CustomElement)).to.be.true;
            expect(element.is(ChildElement)).to.be.false;

            element = new BitstreamElement();

            expect(element.is(BitstreamElement)).to.be.true;
            expect(element.is(CustomElement)).to.be.false;
            expect(element.is(ChildElement)).to.be.false;

            if (element.is(ChildElement)) {
                // This is a meta-test to ensure that is() returns type `this is T` to allow for type inferencing.
                // If you receive a Typescript compilation error here, it is because is() no longer has the correct
                // semantics.

                let child : ChildElement = element;
            }
        });

    });
    describe(': Cloning', it => {
        it('behaves correctly', () => {
            class CustomElement extends BitstreamElement {
                @Field() a : number;
                @Field() b : number;
                @Field() c : number;
            }
    
            let element = new CustomElement().with({ a: 123, b: 456, c: 789 });
            let clone = element.clone();
    
            expect(clone).not.to.equal(element);
            expect(clone.a).to.equal(123);
            expect(clone.b).to.equal(456);
            expect(clone.c).to.equal(789);
        });
        it('works only for @Field() properties', () => {
            class CustomElement extends BitstreamElement {
                @Field() a : number;
                @Field() b : number;
                @Field() c : number;
                d : number;
                e : number;
            }
    
            let element = new CustomElement().with({ a: 123, b: 456, c: 789, d: 888, e: 999 });
            let clone = element.clone();
    
            expect(clone).not.to.equal(element);
            expect(clone.a).to.equal(123);
            expect(clone.b).to.equal(456);
            expect(clone.c).to.equal(789);
            expect(clone.d).to.be.undefined;
            expect(clone.e).to.be.undefined;
        })
    });

    describe('.readBlocking()', it => {
        it('can wait for more data', async () => {
            class CustomElement extends BitstreamElement {
                @Field(8) byte1 : number;
                @Field(8) byte2 : number;
            }

            let reader = new BitstreamReader();
            reader.addBuffer(Buffer.from([ 123 ]));
            setTimeout(() => reader.addBuffer(Buffer.from([ 124 ])), 10);

            let result = await CustomElement.readBlocking(reader);

            expect(result.byte1).to.equal(123);
            expect(result.byte2).to.equal(124);
        });
    });

    it('can handle private fields', async () => {
        class CustomElement extends BitstreamElement {
            @Field(8) private byte1 : number;
            @Field(8) private byte2 : number;
        }

        let reader = new BitstreamReader();
        reader.addBuffer(Buffer.from([ 123, 124 ]));

        let result = await CustomElement.readBlocking(reader);

        expect((result as any).byte1).to.equal(123);
        expect((result as any).byte2).to.equal(124);
    });

    it.only('@Reserved() avoids reused name mistakes', () => {
        class A extends BitstreamElement {
            @Reserved(8) reserved: number;
            @Field(8) field1: number;
        }

        class B extends A {
            @Reserved(16) reserved: number;
            @Field(8) field2: number;
        }

        let b = B.deserialize(Buffer.from([ 0xFF, 1, 0xFF, 0XFF, 2 ]));

        expect(b.field1).to.equal(1);
        expect(b.field2).to.equal(2);
    });

    it('@Field() accepts single options when length is inferred', async () => {
        class CustomElement2 extends BitstreamElement {
            @Field(8) byte2: number;
        }
        class CustomElement extends BitstreamElement {
            @Field(8) byte1 : number;
            @Field({}) sub : CustomElement2;
        }

        let reader = new BitstreamReader();
        reader.addBuffer(Buffer.from([ 123, 124 ]));

        let result = await CustomElement.readBlocking(reader);

        expect(result.byte1).to.equal(123);
        expect(result.sub.byte2).to.equal(124);
    });

    it('can read ahead and make field presence decisions based on what\'s upcoming', () => {
        class CustomElement extends BitstreamElement {
            @Field(8) byte1 : number;
            @Field(8, {
                readAhead: {
                    length: 8,
                    presentWhen: reader => reader.readSync(8) === 111
                }
            }) 
            lucky : number;
            @Field(8) byte3 : number;
        }

        let reader = new BitstreamReader();
        reader.addBuffer(Buffer.from([ 123, 111, 124 ]));

        let result = CustomElement.readSync(reader);

        expect(result.byte1).to.equal(123);
        expect(result.lucky).to.equal(111);
        expect(result.byte3).to.equal(124);

        reader.addBuffer(Buffer.from([ 123, 124 ]));
        result = CustomElement.readSync(reader);
        expect(result.byte1).to.equal(123);
        expect(result.lucky).to.be.undefined;
        expect(result.byte3).to.equal(124);
    });

    it('can read ahead and make field exclusion decisions based on what\'s upcoming', () => {
        class CustomElement extends BitstreamElement {
            @Field(8) byte1 : number;
            @Field(8, {
                readAhead: {
                    length: 8,
                    excludedWhen: reader => reader.readSync(8) !== 111
                }
            }) 
            lucky : number;
            @Field(8) byte3 : number;
        }

        let reader = new BitstreamReader();
        reader.addBuffer(Buffer.from([ 123, 111, 124 ]));

        let result = CustomElement.readSync(reader);

        expect(result.byte1).to.equal(123);
        expect(result.lucky).to.equal(111);
        expect(result.byte3).to.equal(124);
        
        reader.addBuffer(Buffer.from([ 123, 124 ]));
        result = CustomElement.readSync(reader);
        expect(result.byte1).to.equal(123);
        expect(result.lucky).to.be.undefined;
        expect(result.byte3).to.equal(124);
    });

    it('end of stream does not cause read-ahead to fail', () => {
        class CustomElement extends BitstreamElement {
            @Field(8) byte1 : number;
            @Field(8, {
                readAhead: {
                    length: 8,
                    presentWhen: reader => reader.available >= 8
                }
            }) 
            lucky : number;
        }

        let reader = new BitstreamReader();
        reader.addBuffer(Buffer.from([ 1, 2 ]));
        
        let result = CustomElement.readSync(reader);
        expect(result.byte1).to.equal(1);
        expect(result.lucky).to.equal(2);

        reader.addBuffer(Buffer.from([ 1 ]));
        reader.end();

        result = CustomElement.readSync(reader);
        expect(result.byte1).to.equal(1);
        expect(result.lucky).to.be.undefined;
    });
    it('blind read-ahead when faced with end of stream throws', () => {
        class CustomElement extends BitstreamElement {
            @Field(8) byte1 : number;
            @Field(8, {
                readAhead: {
                    length: 8,
                    presentWhen: reader => reader.readSync(8) === 2
                }
            }) 
            lucky : number;
        }

        let reader = new BitstreamReader();
        reader.addBuffer(Buffer.from([ 1, 2 ]));
        
        let result = CustomElement.readSync(reader);
        expect(result.byte1).to.equal(1);
        expect(result.lucky).to.equal(2);

        reader.addBuffer(Buffer.from([ 1 ]));
        reader.end();

        expect(() => CustomElement.readSync(reader)).to.throw;
    });
    
    it('(async) end of stream does not cause read-ahead to fail', async () => {
        class CustomElement extends BitstreamElement {
            @Field(8) byte1 : number;
            @Field(8, {
                readAhead: {
                    length: 8,
                    presentWhen: reader => reader.available >= 8
                }
            }) 
            lucky : number;
        }

        let reader = new BitstreamReader();
        reader.addBuffer(Buffer.from([ 1, 2 ]));
        
        let result = await CustomElement.readBlocking(reader);
        expect(result.byte1).to.equal(1);
        expect(result.lucky).to.equal(2);

        reader.addBuffer(Buffer.from([ 1 ]));
        reader.end();

        result = await CustomElement.readBlocking(reader);
        expect(result.byte1).to.equal(1);
        expect(result.lucky).to.be.undefined;
    });
    it('(async) blind read-ahead when faced with end of stream throws', async () => {
        class CustomElement extends BitstreamElement {
            @Field(8) byte1 : number;
            @Field(8, {
                readAhead: {
                    length: 8,
                    presentWhen: reader => reader.readSync(8) === 2
                }
            }) 
            lucky : number;
        }

        let reader = new BitstreamReader();
        reader.addBuffer(Buffer.from([ 1, 2 ]));
        
        let result = await CustomElement.readBlocking(reader);
        expect(result.byte1).to.equal(1);
        expect(result.lucky).to.equal(2);

        reader.addBuffer(Buffer.from([ 1 ]));
        reader.end();

        let thrown = await CustomElement.readBlocking(reader).then(() => false).catch(() => true);

        expect(thrown).to.be.true;
    });
    describe(': Inheritance', it => {
        it('ownSyntax should be an empty array on a child element with no syntax of its own', () => {
            class CustomElement extends BitstreamElement { @Field(8) byte; }
            class CustomElement2 extends CustomElement { }
            expect(CustomElement2.ownSyntax).to.eql([]);
        })
        it('ownSyntax should not contain syntax from parent class', () => {
            class CustomElement extends BitstreamElement { @Field(8) byte; }
            class CustomElement2 extends CustomElement { @Field(8) byte2; }
            expect(CustomElement2.ownSyntax.length).to.eql(1);
            expect(CustomElement2.ownSyntax[0].name).to.eql('byte2');
        })
        it('ownSyntax should not contain syntax from child class', () => {
            class CustomElement extends BitstreamElement { @Field(8) byte; }
            class CustomElement2 extends CustomElement { @Field(8) byte2; }
            expect(CustomElement.ownSyntax.length).to.eql(1);
            expect(CustomElement.ownSyntax[0].name).to.eql('byte');
        })
        it('correctly deserializes a basic element in synchronous mode', async () => {
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
    
            let element = await ExampleElement.readBlocking(bitstream);
    
            expect(element.a).to.equal(0b10);
            expect(element.b).to.equal(0b010);
            expect(element.c).to.equal(0b1101);
            expect(element.d).to.equal(0b01011);
            expect(element.e).to.equal(0b000010);
        });
        it('correctly deserializes nested elements', async () => {
    
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
    
            let element = await WholeElement.readBlocking(bitstream);
    
            expect(element.a)       .to.equal(0b1);
            expect(element.b)       .to.equal(0b10);
            expect(element.part.c)  .to.equal(0b101);
            expect(element.part.d)  .to.equal(0b1010);
            expect(element.e)       .to.equal(0b10110);
            expect(element.f)       .to.equal(0b000101);
        });
        it('correctly deserializes inherited fields', async () => {
            
            class BaseElement extends BitstreamElement {
                @Field(1) a;
                @Field(2) b;
            }

            class ExtendedElement extends BaseElement {
                @Field(3) c;
                @Field(4) d;
                @Field(5) e;
                @Field(6) f;
            }

            //            ||-|--|---|----|-----X-----
            let value = 0b11010110101011000010100000000000;
            let buffer = Buffer.alloc(4);
            buffer.writeUInt32BE(value);

            let bitstream = new BitstreamReader();
            bitstream.addBuffer(buffer);

            let element = await ExtendedElement.readBlocking(bitstream);

            expect(element.a).to.equal(0b1);
            expect(element.b).to.equal(0b10);
            expect(element.c).to.equal(0b101);
            expect(element.d).to.equal(0b1010);
            expect(element.e).to.equal(0b10110);
            expect(element.f).to.equal(0b000101);

        });
    });
    describe(': Numbers', it => {
        it('reads unsigned integers', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
            }

            let element = CustomElement.deserialize(Buffer.from([126, 72]));

            expect(element.a).to.equal(126);
            expect(element.b).to.equal(72);
        });
        it('writes unsigned integers', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
            }

            let buf = new CustomElement().with({ a: 126, b: 72 }).serialize();
            expect(Array.from(buf)).to.eql([ 126, 72 ]);
        });
        it('reads signed integers', () => {
            class CustomElement extends BitstreamElement {
                @Field(8, { number: { format: 'signed' }}) a : number;
                @Field(8, { number: { format: 'signed' }}) b : number;
                @Field(8, { number: { format: 'signed' }}) c : number;
            }

            let element = CustomElement.deserialize(Buffer.from([0xFB, 5, 0]));

            expect(element.a).to.equal(-5);
            expect(element.b).to.equal(5);
            expect(element.c).to.equal(0);
        });
        it('writes signed integers', () => {
            class CustomElement extends BitstreamElement {
                @Field(8, { number: { format: 'signed' }}) a : number;
                @Field(8, { number: { format: 'signed' }}) b : number;
                @Field(8, { number: { format: 'signed' }}) c : number;
            }

            let buf = new CustomElement().with({ a: -5, b: 5, c: 0 }).serialize();
            expect(Array.from(buf)).to.eql([ 0xFB, 5, 0 ]);
        });
        it('reads floats', () => {
            class CustomElement extends BitstreamElement {
                @Field(32, { number: { format: 'float' }}) a : number;
                @Field(32, { number: { format: 'float' }}) b : number;
                @Field(32, { number: { format: 'float' }}) c : number;
            }

            let element = CustomElement.deserialize(Buffer.from([
                0x42, 0xCD, 0x00, 0x00,
                0xC3, 0xDA, 0x00, 0x00,
                0,0,0,0
            ]));

            expect(element.a).to.equal(102.5);
            expect(element.b).to.equal(-436);
            expect(element.c).to.equal(0);
        });
        it('writes floats', () => {
            class CustomElement extends BitstreamElement {
                @Field(32, { number: { format: 'float' }}) a : number;
                @Field(32, { number: { format: 'float' }}) b : number;
                @Field(32, { number: { format: 'float' }}) c : number;
            }

            let buf = new CustomElement().with({ a: 102.5, b: -436, c: 0 }).serialize();
            expect(Array.from(buf)).to.eql([
                0x42, 0xCD, 0x00, 0x00,
                0xC3, 0xDA, 0x00, 0x00,
                0,0,0,0
            ]);
        });
        it('throws with an invalid format while reading', () => {
            class CustomElement extends BitstreamElement {
                @Field(32, { number: { format: <any>'invalid' }}) a : number;
                @Field(32, { number: { format: <any>'invalid' }}) b : number;
                @Field(32, { number: { format: <any>'invalid' }}) c : number;
            }

            let caught;
            try {
                CustomElement.deserialize(Buffer.from([
                    0x42, 0xCD, 0x00, 0x00,
                    0xC3, 0xDA, 0x00, 0x00,
                    0,0,0,0
                ]));
            } catch (e) {
                caught = e;
            }

            expect(caught).to.exist;
        });
        it('throws with an invalid format while writing', () => {
            class CustomElement extends BitstreamElement {
                @Field(32, { number: { format: <any>'invalid' }}) a : number;
                @Field(32, { number: { format: <any>'invalid' }}) b : number;
                @Field(32, { number: { format: <any>'invalid' }}) c : number;
            }

            let caught;
            try {
                new CustomElement().with({ a: 0, b: 0, c: 0 }).serialize();
            } catch (e) {
                caught = e;
            }

            expect(caught).to.exist;
        });
        it('throws when the length determinant throws while reading', () => {
            class CustomElement extends BitstreamElement {
                @Field(i => { throw new Error('uh oh'); }) a : number;
            }

            let caught;
            try {
                CustomElement.deserialize(Buffer.from([]));
            } catch (e) {
                caught = e;
            }

            expect(caught).to.exist;
            expect(caught.message).to.contain('uh oh');
        });
        it('throws when the length determinant throws while writing', () => {
            class CustomElement extends BitstreamElement {
                @Field(i => { throw new Error('uh oh'); }) a : number;
            }

            let caught;
            try {
                new CustomElement().with({ a: 123 }).serialize();
            } catch (e) {
                caught = e;
            }

            expect(caught).to.exist;
            expect(caught.message).to.contain('uh oh');
        });
        it('writes undefined as zero', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) a = 123;
                @Field(8) b : number;
                @Field(8) c = 22;
            }

            let buf = new CustomElement().with({ b: undefined }).serialize();

            expect(Array.from(buf)).to.eql([ 123, 0, 22 ]);
        });
        it('writes null as zero', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) a = 123;
                @Field(8) b : number;
                @Field(8) c = 22;
            }

            let buf = new CustomElement().with({ b: null }).serialize();

            expect(Array.from(buf)).to.eql([ 123, 0, 22 ]);
        });
    });
    describe(': Booleans', it => {
        it('has the correct default behavior while reading', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) a : boolean;
                @Field(8) b : boolean;
                @Field(8) c : boolean;
                @Field(8) d : boolean;
            }

            let element = CustomElement.deserialize(Buffer.from([ 0, 1, 2, 0 ]));

            expect(element.a).to.equal(false);
            expect(element.b).to.equal(true);
            expect(element.c).to.equal(true);
            expect(element.d).to.equal(false);
        });
        it('respects the chosen true/false values when reading with default mode', () => {
            class CustomElement extends BitstreamElement {
                @Field(8, { boolean: { true: 0, false: 1 }}) a : boolean;
                @Field(8, { boolean: { true: 0, false: 1 }}) b : boolean;
                @Field(8, { boolean: { true: 0, false: 1 }}) c : boolean;
                @Field(8, { boolean: { true: 0, false: 1 }}) d : boolean;
            }

            let element = CustomElement.deserialize(Buffer.from([ 0, 1, 2, 0 ]));

            expect(element.a).to.equal(true);
            expect(element.b).to.equal(false);
            expect(element.c).to.equal(true);
            expect(element.d).to.equal(true);
        });
        it('respects the chosen true/false values when reading with mode=false-unless', () => {
            class CustomElement extends BitstreamElement {
                @Field(8, { boolean: { true: 0, false: 1, mode: 'false-unless' }}) a : boolean;
                @Field(8, { boolean: { true: 0, false: 1, mode: 'false-unless' }}) b : boolean;
                @Field(8, { boolean: { true: 0, false: 1, mode: 'false-unless' }}) c : boolean;
                @Field(8, { boolean: { true: 0, false: 1, mode: 'false-unless' }}) d : boolean;
            }

            let element = CustomElement.deserialize(Buffer.from([ 0, 1, 2, 0 ]));

            expect(element.a).to.equal(true);
            expect(element.b).to.equal(false);
            expect(element.c).to.equal(false);
            expect(element.d).to.equal(true);
        });
        it('respects the chosen true/false values when reading with mode=true-unless', () => {
            class CustomElement extends BitstreamElement {
                @Field(8, { boolean: { true: 0, false: 1, mode: 'true-unless' }}) a : boolean;
                @Field(8, { boolean: { true: 0, false: 1, mode: 'true-unless' }}) b : boolean;
                @Field(8, { boolean: { true: 0, false: 1, mode: 'true-unless' }}) c : boolean;
                @Field(8, { boolean: { true: 0, false: 1, mode: 'true-unless' }}) d : boolean;
            }

            let element = CustomElement.deserialize(Buffer.from([ 0, 1, 2, 0 ]));

            expect(element.a).to.equal(true);
            expect(element.b).to.equal(false);
            expect(element.c).to.equal(true);
            expect(element.d).to.equal(true);
        });
        it('respects the chosen true/false values when reading with mode=undefined', () => {
            class CustomElement extends BitstreamElement {
                @Field(8, { boolean: { true: 0, false: 1, mode: 'undefined' }}) a : boolean;
                @Field(8, { boolean: { true: 0, false: 1, mode: 'undefined' }}) b : boolean;
                @Field(8, { boolean: { true: 0, false: 1, mode: 'undefined' }}) c : boolean;
                @Field(8, { boolean: { true: 0, false: 1, mode: 'undefined' }}) d : boolean;
            }

            let element = CustomElement.deserialize(Buffer.from([ 0, 1, 2, 0 ]));

            expect(element.a).to.equal(true);
            expect(element.b).to.equal(false);
            expect(element.c).to.be.undefined;
            expect(element.d).to.equal(true);
        });
        it('behaves correctly with mode=undefined', () => {
            class CustomElement extends BitstreamElement {
                @Field(8, { boolean: { mode: 'undefined' }}) a : boolean;
                @Field(8, { boolean: { mode: 'undefined' }}) b : boolean;
                @Field(8, { boolean: { mode: 'undefined' }}) c : boolean;
                @Field(8, { boolean: { mode: 'undefined' }}) d : boolean;
            }

            let element = CustomElement.deserialize(Buffer.from([ 0, 1, 2, 0 ]));

            expect(element.a).to.equal(false);
            expect(element.b).to.equal(true);
            expect(element.c).to.be.undefined;
            expect(element.d).to.equal(false);
        });
        it('has the correct default behavior while writing', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) a : boolean;
                @Field(8) b : boolean;
                @Field(8) c : boolean;
                @Field(8) d : boolean;
            }

            let buffer = new CustomElement().with({ a: true, b: false, c: true, d: false }).serialize();
            expect(Array.from(buffer)).to.eql([ 1, 0, 1, 0 ]);
        });
        it('respects the chosen undefined value while writing', () => {
            class CustomElement extends BitstreamElement {
                @Field(8, { boolean: { undefined: 99 }}) a : boolean;
                @Field(8, { boolean: { undefined: 99 }}) b : boolean;
                @Field(8, { boolean: { undefined: 99 }}) c : boolean;
                @Field(8, { boolean: { undefined: 99 }}) d : boolean;
            }

            let buffer = new CustomElement().with({ a: true, b: false, c: undefined, d: false }).serialize();
            expect(Array.from(buffer)).to.eql([ 1, 0, 99, 0 ]);
        });
    });
    describe(': Byte Arrays', it => {
        it('understands Buffer when length is a multiple of 8', async () => {
            class CustomElement extends BitstreamElement {
                @Field(4) a;
                @Field(4) b;
                @Field(16) c : Buffer;
            }
    
            //            |---|---|---------------X
            let value = 0b11010110101011000010100000000000;
            let buffer = Buffer.alloc(4);
            buffer.writeUInt32BE(value);
    
            let bitstream = new BitstreamReader();
            bitstream.addBuffer(buffer);
    
            let element = await CustomElement.readBlocking(bitstream);
    
            expect(element.a).to.equal(0b1101);
            expect(element.b).to.equal(0b0110);
            expect(element.c.length).to.equal(2);
            expect(element.c[0]).to.equal(0b10101100);
            expect(element.c[1]).to.equal(0b00101000);
        });
        it('uses Uint8Array when requested even if Buffer is available', async () => {
            class CustomElement extends BitstreamElement {
                @Field(4) a;
                @Field(4) b;
                @Field(16) c : Uint8Array;
            }
    
            //            |---|---|---------------X
            let value = 0b11010110101011000010100000000000;
            let buffer = Buffer.alloc(4);
            buffer.writeUInt32BE(value);
    
            let bitstream = new BitstreamReader();
            bitstream.addBuffer(buffer);
    
            let element = await CustomElement.readBlocking(bitstream);

            expect(element.a).to.equal(0b1101);
            expect(element.b).to.equal(0b0110);
            expect(element.c).to.be.instanceOf(Uint8Array);
            expect(element.c.length).to.equal(2);
            expect(element.c[0]).to.equal(0b10101100);
            expect(element.c[1]).to.equal(0b00101000);
        });
        it('uses Uint8Array when Buffer is not available', async () => {

            const BufferT = Buffer;

            (globalThis as any).Buffer = undefined;

            try {
                class CustomElement extends BitstreamElement {
                    @Field(4) a;
                    @Field(4) b;
                    @Field(16) c : Uint8Array;
                }
        
                //            |---|---|---------------X
                let value = 0b11010110101011000010100000000000;
                let buffer = new ArrayBuffer(4);
                let view = new DataView(buffer);
                view.setUint32(0, value);
        
                let bitstream = new BitstreamReader();
                bitstream.addBuffer(new Uint8Array(buffer));
        
                let element = await CustomElement.readBlocking(bitstream);

                expect(element.a).to.equal(0b1101);
                expect(element.b).to.equal(0b0110);
                expect(element.c).to.be.instanceOf(Uint8Array);
                expect(element.c.length).to.equal(2);
                expect(element.c[0]).to.equal(0b10101100);
                expect(element.c[1]).to.equal(0b00101000);
            } finally {
                (globalThis as any).Buffer = BufferT;
            }
        });
        it('writes fixed size Buffer correctly', () => {
            let writable = new BufferedWritable();
            let writer = new BitstreamWriter(writable);
            class Element extends BitstreamElement {
                @Field(8*4) buffer : Buffer;
            }

            new Element().with({ buffer: Buffer.from([1,2,3,4])}).write(writer);

            expect(writable.buffer.length).to.equal(4);
            expect(Array.from(writable.buffer)).to.eql([1,2,3,4]);
        });
        it('respects writtenValue', () => {
            let writable = new BufferedWritable();
            let writer = new BitstreamWriter(writable);
            class Element extends BitstreamElement {
                @Field(8*4, { writtenValue: () => Buffer.from([1,2,3,4]) }) 
                buffer : Buffer;
            }

            new Element().with({ buffer: Buffer.from([4,3,2,1])}).write(writer);

            expect(writable.buffer.length).to.equal(4);
            expect(Array.from(writable.buffer)).to.eql([1,2,3,4]);
        });
        it('truncates Buffer to fixed length by default', () => {
            let writable = new BufferedWritable();
            let writer = new BitstreamWriter(writable);
            class Element extends BitstreamElement {
                @Field(4*8) buffer : Buffer;
            }

            new Element().with({ buffer: Buffer.from([1,2,3,4,5,6,7,8])}).write(writer);

            expect(writable.buffer.length).to.equal(4);
            expect(Array.from(writable.buffer)).to.eql([1,2,3,4]);
        });
        it('does not truncate Buffer when larger than fixed length and truncate=false', () => {
            let writable = new BufferedWritable();
            let writer = new BitstreamWriter(writable);
            class Element extends BitstreamElement {
                @Field(8*4, { buffer: { truncate: false }}) buffer : Buffer;
            }

            new Element().with({ buffer: Buffer.from([1,2,3,4,5,6,7,8])}).write(writer);

            expect(writable.buffer.length).to.equal(8);
            expect(Array.from(writable.buffer)).to.eql([1,2,3,4,5,6,7,8]);
        });
        it('does not truncate Buffer when larger than fixed length and truncate=false', () => {
            let writable = new BufferedWritable();
            let writer = new BitstreamWriter(writable);
            class Element extends BitstreamElement {
                @Field(8*4, { buffer: { truncate: false }}) buffer : Buffer;
            }

            new Element().with({ buffer: Buffer.from([1,2,3,4,5,6,7,8])}).write(writer);

            expect(writable.buffer.length).to.equal(8);
            expect(Array.from(writable.buffer)).to.eql([1,2,3,4,5,6,7,8]);
        });
        it('writes full declared size when Buffer is shorter', () => {
            let writable = new BufferedWritable();
            let writer = new BitstreamWriter(writable);
            class Element extends BitstreamElement {
                @Field(8*8) buffer : Buffer;
            }

            new Element().with({ buffer: Buffer.from([1,2,3,4])}).write(writer);

            expect(writable.buffer.length).to.equal(8);
            expect(Array.from(writable.buffer)).to.eql([1,2,3,4,0,0,0,0]);
        });
        it('does not write full declared size when Buffer is shorter and truncate=false', () => {
            let writable = new BufferedWritable();
            let writer = new BitstreamWriter(writable);
            class Element extends BitstreamElement {
                @Field(8*8, { buffer: { truncate: false }}) buffer : Buffer;
            }

            new Element().with({ buffer: Buffer.from([1,2,3,4])}).write(writer);

            expect(writable.buffer.length).to.equal(4);
            expect(Array.from(writable.buffer)).to.eql([1,2,3,4]);
        });
        it('uses the specified `fill` value when Buffer is shorter', () => {
            let writable = new BufferedWritable();
            let writer = new BitstreamWriter(writable);
            class Element extends BitstreamElement {
                @Field(8*8, { buffer: { fill: 135 }}) buffer : Buffer;
            }

            new Element().with({ buffer: Buffer.from([1,2,3,4])}).write(writer);

            expect(writable.buffer.length).to.equal(8);
            expect(Array.from(writable.buffer)).to.eql([1,2,3,4,135,135,135,135]);
        });
        it('uses the specified `fill` value when Buffer is shorter and truncate=false', () => {
            let writable = new BufferedWritable();
            let writer = new BitstreamWriter(writable);
            class Element extends BitstreamElement {
                @Field(8*8, { buffer: { truncate: false, fill: 135 }}) buffer : Buffer;
            }

            new Element().with({ buffer: Buffer.from([1,2,3,4])}).write(writer);

            expect(writable.buffer.length).to.equal(8);
            expect(Array.from(writable.buffer)).to.eql([1,2,3,4,135,135,135,135]);
        });
        it('still truncates the buffer length when `fill` is set but `truncate` is true (as default)', () => {
            let writable = new BufferedWritable();
            let writer = new BitstreamWriter(writable);
            class Element extends BitstreamElement {
                @Field(4*8, { buffer: { fill: 135 }}) buffer : Buffer;
            }

            new Element().with({ buffer: Buffer.from([1,2,3,4,5,6,7,8])}).write(writer);

            expect(writable.buffer.length).to.equal(4);
            expect(Array.from(writable.buffer)).to.eql([1,2,3,4]);
        });
        it('still truncates the buffer length when `fill` is set but `truncate` is true (explicitly)', () => {
            let writable = new BufferedWritable();
            let writer = new BitstreamWriter(writable);
            class Element extends BitstreamElement {
                @Field(4*8, { buffer: { truncate: true, fill: 135 }}) buffer : Buffer;
            }

            new Element().with({ buffer: Buffer.from([1,2,3,4,5,6,7,8])}).write(writer);

            expect(writable.buffer.length).to.equal(4);
            expect(Array.from(writable.buffer)).to.eql([1,2,3,4]);
        });
        it('fails when Buffer field has non multiple-of-8 length', () => {
            let caught : Error;
    
            try {
                class CustomElement extends BitstreamElement {
                    @Field(4) a;
                    @Field(4) b;
                    @Field(7) c : Buffer;
                }
            } catch (e) {
                caught = e;
            }
    
            expect(caught, 'should have thrown an error').to.exist;
        });
        it('throws when length determinant throws during read', () => {
            let caught : Error;
    
            try {
                class CustomElement extends BitstreamElement {
                    @Field(4) a;
                    @Field(4) b;
                    @Field(i => { throw new Error('uh oh'); }) c : Buffer;
                }

                CustomElement.deserialize(Buffer.alloc(16));

            } catch (e) {
                caught = e;
            }
    
            expect(caught, 'should have thrown an error').to.exist;
            expect(caught.message).to.contain('uh oh');
        });
        it('throws when length determinant throws during write', () => {
            let caught : Error;
    
            try {
                class CustomElement extends BitstreamElement {
                    @Field(4) a;
                    @Field(4) b;
                    @Field(i => { throw new Error('uh oh'); }) c : Buffer;
                }

                new CustomElement().with({ a: 0, b: 1, c: Buffer.alloc(1) }).serialize();

            } catch (e) {
                caught = e;
            }
    
            expect(caught, 'should have thrown an error').to.exist;
            expect(caught.message).to.contain('uh oh');
        });
    });
    describe(': Strings', it => {
        it('are read correctly', async () => {
            class CustomElement extends BitstreamElement {
                @Field(4) a;
                @Field(4) b;
                @Field(5) c : string;
            }
    
            let bitstream = new BitstreamReader();
            bitstream.addBuffer(Buffer.from([ 0b11010110 ]));
            bitstream.addBuffer(Buffer.from('hello', 'utf-8'));
    
            let element = await CustomElement.readBlocking(bitstream);
    
            expect(element.a).to.equal(0b1101);
            expect(element.b).to.equal(0b0110);
            expect(element.c).to.equal('hello');
        });
        it('are written correctly', async () => {
            class CustomElement extends BitstreamElement {
                @Field(5) c : string;
            }
    
            let buf = Buffer.from(new CustomElement().with({ c: 'hello' }).serialize());
            
            expect(buf.toString('utf-8')).to.equal('hello');
        });
        it('are written correctly (utf16le)', async () => {
            class CustomElement extends BitstreamElement {
                @Field(10, { string: { encoding: 'utf16le' }}) c : string;
            }
    
            let buf = Buffer.from(new CustomElement().with({ c: 'hello' }).serialize());
            
            expect(buf.toString('utf16le')).to.equal('hello');
        });
    });
    describe(': Fields', it => {
        it('understands determinants', async () => {
            class CustomElement extends BitstreamElement {
                @Field(8) charCount;
                @Field(i => i.charCount) str : string;
                @Field(8) afterwards;
            }
    
            let bitstream = new BitstreamReader();
            bitstream.addBuffer(Buffer.from([ 5 ]));
            bitstream.addBuffer(Buffer.from('hello', 'utf-8'));
            bitstream.addBuffer(Buffer.from([ 123 ]));
    
            let element = await CustomElement.readBlocking(bitstream);
    
            expect(element.charCount).to.equal(5);
            expect(element.str).to.equal('hello');
            expect(element.afterwards).to.equal(123);
        });
        it('should throw when result of a length determinant is not a number', async () => {
            
            let caught;
            class CustomElement extends BitstreamElement {
                @Field(8) charCount;
                @Field(i => <any>'foo') str : string;
                @Field(8) afterwards;
            }
    
            let bitstream = new BitstreamReader();
            bitstream.addBuffer(Buffer.from([ 5 ]));
            bitstream.addBuffer(Buffer.from('hello', 'utf-8'));
            bitstream.addBuffer(Buffer.from([ 123 ]));
    
            try {
                await CustomElement.readBlocking(bitstream);
            } catch (e) {
                caught = e;
            }
    
            expect(caught).to.exist;
        });
        it('should throw when result of a length determinant is undefined', async () => {
            
            let caught;
            class CustomElement extends BitstreamElement {
                @Field(8) charCount;
                @Field(i => undefined) str : string;
                @Field(8) afterwards;
            }
    
            let bitstream = new BitstreamReader();
            bitstream.addBuffer(Buffer.from([ 5 ]));
            bitstream.addBuffer(Buffer.from('hello', 'utf-8'));
            bitstream.addBuffer(Buffer.from([ 123 ]));
    
            try {
                await CustomElement.readBlocking(bitstream);
            } catch (e) {
                caught = e;
            }
    
            expect(caught).to.exist;
        });
    });
    describe(': Element Fields', it => {
        it('reads nested element fields correctly', () => {
            class Child2Element extends BitstreamElement {
                @Field(8) byte;
            }
            class ChildElement extends BitstreamElement {
                @Field() child : Child2Element;
            }
            class CustomElement extends BitstreamElement {
                @Field() child : ChildElement;
            }

            let element = CustomElement.deserialize(Buffer.from([ 8 ]));

            expect(element.child).to.be.instanceOf(ChildElement);
            expect(element.child.child).to.be.instanceOf(Child2Element);
            expect(element.child.child.byte).to.equal(8);
        });
        it('writes nested element fields correctly', () => {
            class Child2Element extends BitstreamElement {
                @Field(8) byte;
            }
            class ChildElement extends BitstreamElement {
                @Field() child : Child2Element;
            }
            class CustomElement extends BitstreamElement {
                @Field() child : ChildElement;
            }

            let buf = new CustomElement().with({ 
                child: new ChildElement().with({ 
                    child: new Child2Element().with({ 
                        byte: 101 
                    })
                })
            }).serialize();

            expect(buf.length).to.equal(1);
            expect(buf[0]).to.equal(101);
        });
        it('throws when nested element is null', () => {
            class Child2Element extends BitstreamElement {
                @Field(8) byte;
            }
            class ChildElement extends BitstreamElement {
                @Field() child : Child2Element;
            }
            class CustomElement extends BitstreamElement {
                @Field() child : ChildElement;
            }

            let caught;
            try {
                new CustomElement().with({ 
                    child: null
                }).serialize();
            } catch (e) { caught = e; }

            expect(caught).to.exist;
        });
        it('throws when nested element is undefined', () => {
            class Child2Element extends BitstreamElement {
                @Field(8) byte;
            }
            class ChildElement extends BitstreamElement {
                @Field() child : Child2Element;
            }
            class CustomElement extends BitstreamElement {
                @Field() child : ChildElement;
            }

            let caught;
            try {
                new CustomElement().with({ 
                    child: undefined
                }).serialize();
            } catch (e) { caught = e; }

            expect(caught).to.exist;
        });
        it('throws when nested element is the wrong type of object', () => {
            class Child2Element extends BitstreamElement {
                @Field(8) byte;
            }
            class ChildElement extends BitstreamElement {
                @Field() child : Child2Element;
            }
            class CustomElement extends BitstreamElement {
                @Field() child : ChildElement;
            }

            let caught;
            try {
                new CustomElement().with({ 
                    child: <any>{ }
                }).serialize();
            } catch (e) { caught = e; }

            expect(caught).to.exist;
        });
        it('throws when nested element is a string', () => {
            class Child2Element extends BitstreamElement {
                @Field(8) byte;
            }
            class ChildElement extends BitstreamElement {
                @Field() child : Child2Element;
            }
            class CustomElement extends BitstreamElement {
                @Field() child : ChildElement;
            }

            let caught;
            try {
                new CustomElement().with({ 
                    child: <any>'hello'
                }).serialize();
            } catch (e) { caught = e; }

            expect(caught).to.exist;
        });
    });
    describe(': Arrays', it => {
        it('should throw when used without specifying array: { type }', () => {
            
            let caught;
            try {
                class CustomElement extends BitstreamElement {
                    @Field(8) before;
                    @Field(0, { array: { countFieldLength: 8 } }) items : any[];
                    @Field(8) afterwards;
                }
            } catch (e) {
                caught = e;
            }
    
            expect(caught).to.exist;
        });
        it('should correctly read an array with a static count determinant', async () => {
            class CustomElement extends BitstreamElement {
                @Field(8) before;
                @Field(0, { array: { type: Number, count: 3, elementLength: 10 } }) items : number[];
            }
            let bitstream = new BitstreamReader();
            bitstream.addBuffer(Buffer.from([ 123, 0b10011001, 0b10100110, 0b01011011, 0b00111010, 0b10111001 ]));
    
            let element = await CustomElement.readBlocking(bitstream);
    
            expect(element.before).to.equal(123);
            expect(element.items.length).to.equal(3);
            expect(element.items[0]).to.equal(0b1001100110);
            expect(element.items[1]).to.equal(0b1001100101);
            expect(element.items[2]).to.equal(0b1011001110);
        });
        it('should correctly write an array with a static count determinant', async () => {
            class CustomElement extends BitstreamElement {
                @Field(8) before;
                @Field(0, { array: { type: Number, count: 3, elementLength: 8 } }) items : number[];
            }

            let buf = new CustomElement().with({ before: 122, items: [ 3, 4, 5 ]}).serialize();
            expect(Array.from(buf)).to.eql([ 122, 3, 4, 5]);
        });
        it('should understand a dynamic count determinant', async () => {
            class CustomElement extends BitstreamElement {
                @Field(8) count;
                @Field(8) before;
                @Field(0, { array: { type: Number, count: i => i.count, elementLength: 10 } }) items : number[];
            }
            let bitstream = new BitstreamReader();
            bitstream.addBuffer(Buffer.from([ 3, 123, 0b10011001, 0b10100110, 0b01011011, 0b00111010, 0b10111001 ]));
    
            let element = await CustomElement.readBlocking(bitstream);
    
            expect(element.before).to.equal(123);
            expect(element.items.length).to.equal(3);
            expect(element.items[0]).to.equal(0b1001100110);
            expect(element.items[1]).to.equal(0b1001100101);
            expect(element.items[2]).to.equal(0b1011001110);
        });
        it('should throw when dynamic count determinant throws', async () => {
            class CustomElement extends BitstreamElement {
                @Field(8) before;
                @Field(0, { array: { type: Number, count: i => { throw new Error('uh oh'); }, elementLength: 8 } }) items : number[];
            }

            let caught;
            try {
                new CustomElement().with({ before: 122, items: [ 3, 4, 5 ]}).serialize();
            } catch (e) { 
                caught = e; 
            }
            expect(caught).to.exist;
        });
        describe(': { array: { hasMore } }', it => {
            it('when hasMore throws serialization should fail', async () => {
                let throwable = new Error('uh oh');
                class CustomElement extends BitstreamElement {
                    @Field(0, { array: { type: Number, elementLength: 8, hasMore: a => { throw throwable } }, number: { format: 'signed' } }) 
                    items : number[];
                }
                let bitstream = new BitstreamReader();
                bitstream.addBuffer(Buffer.from([ 12, 34, 56, 78, 0 ]));
        
                let caught;

                try {
                    await CustomElement.readBlocking(bitstream);
                } catch (e) { 
                    caught = e;
                }
                
                expect(caught).to.exist;
                expect(caught.message).to.contain('uh oh');
            });
            it('hasMore should be able to observe the array being built', async () => {
                class CustomElement extends BitstreamElement {
                    @Field(0, { array: { type: Number, elementLength: 8, hasMore: a => a[a.length - 1] !== 0 }, number: { format: 'signed' } }) 
                    items : number[];
                }
                let bitstream = new BitstreamReader();
                bitstream.addBuffer(Buffer.from([ 12, 34, 56, 78, 0 ]));
        
                let element = await CustomElement.readBlocking(bitstream);
        
                expect(element.items.length).to.equal(5);
                expect(element.items[0]).to.equal(12);
                expect(element.items[1]).to.equal(34);
                expect(element.items[2]).to.equal(56);
                expect(element.items[3]).to.equal(78);
                expect(element.items[4]).to.equal(0);
            });
        });
        describe('of numbers', it => {
            it('should throw when number type is unknown', async () => {
                class CustomElement extends BitstreamElement {
                    @Field(3, { array: { type: Number, elementLength: 32 }, number: { format: <any>'not-real' } }) 
                    items : number[];
                }
                let bitstream = new BitstreamReader();
                bitstream.addBuffer(Buffer.from([ 
                    0x42, 0xCD, 0x00, 0x00,
                    0xC3, 0xDA, 0x00, 0x00,
                    0,0,0,0
                ]));
        
                let caught;
                try {
                    await CustomElement.readBlocking(bitstream);
                } catch (e) { caught = e; }

                expect(caught).to.exist;
            });
            it(': unsigned integers', async () => {
                class CustomElement extends BitstreamElement {
                    @Field(8) before;
                    @Field(0, { array: { type: Number, countFieldLength: 8, elementLength: 10 } }) items : number[];
                }

                let element = await CustomElement.deserialize(Buffer.from([ 
                    123, 3, 0b10011001, 0b10100110, 0b01011011, 0b00111010, 0b10111001 
                ]));

                expect(element.before).to.equal(123);
                expect(element.items.length).to.equal(3);
                expect(element.items[0]).to.equal(0b1001100110);
                expect(element.items[1]).to.equal(0b1001100101);
                expect(element.items[2]).to.equal(0b1011001110);

                class CustomElement2 extends BitstreamElement {
                    @Field(8) before;
                    @Field(0, { array: { type: Number, countFieldLength: 8, elementLength: 8 } }) items : number[];
                }
                let buf = new CustomElement2().with({ before: 123, items: [ 7, 8, 9]}).serialize();

                expect(Array.from(buf)).to.eql([
                    123, 3, 7, 8, 9
                ])
            });
            it(': unsigned integers: hasMore', async () => {
                class CustomElement extends BitstreamElement {
                    @Field(0, { array: { type: Number, elementLength: 8, hasMore: a => a[a.length - 1] !== 0 } }) 
                    items : number[];
                }
                let bitstream = new BitstreamReader();
                bitstream.addBuffer(Buffer.from([ 12, 34, 56, 78, 0 ]));
        
                let element = await CustomElement.readBlocking(bitstream);
        
                expect(element.items.length).to.equal(5);
                expect(element.items[0]).to.equal(12);
                expect(element.items[1]).to.equal(34);
                expect(element.items[2]).to.equal(56);
                expect(element.items[3]).to.equal(78);
                expect(element.items[4]).to.equal(0);
            });
            it(': signed integers', async () => {
                class CustomElement extends BitstreamElement {
                    @Field(3, { array: { type: Number, elementLength: 8 }, number: { format: 'signed' } }) 
                    items : number[];
                }
                
                let element = await CustomElement.deserialize(Buffer.from([ 0xFB, 5, 0 ]));

                expect(element.items.length).to.equal(3);
                expect(element.items[0]).to.equal(-5);
                expect(element.items[1]).to.equal(5);
                expect(element.items[2]).to.equal(0);

                let buf = new CustomElement().with({ items: [ -5, 5, 0]}).serialize();
                expect(Array.from(buf)).to.eql([0xFB, 5, 0]);
            });
            it(': floats', async () => {
                class CustomElement extends BitstreamElement {
                    @Field(3, { array: { type: Number, elementLength: 32 }, number: { format: 'float' } }) 
                    items : number[];
                }

                let bin = [ 
                    0x42, 0xCD, 0x00, 0x00,
                    0xC3, 0xDA, 0x00, 0x00,
                    0,0,0,0
                ];
                let element = await CustomElement.deserialize(Buffer.from(bin));
        
                expect(element.items.length).to.equal(3);
                expect(element.items[0]).to.equal(102.5);
                expect(element.items[1]).to.equal(-436);
                expect(element.items[2]).to.equal(0);

                let buf = new CustomElement().with({ items: [ 102.5, -436, 0]}).serialize();
                expect(Array.from(buf)).to.eql(bin);
            });
        });
        describe('of elements', it => {
            it('should correctly parse elements', async () => {
                class ItemElement extends BitstreamElement {
                    @Field(8) a;
                    @Field(8) b;
                }
                class CustomElement extends BitstreamElement {
                    @Field(8) before;
                    @Field(0, { array: { type: ItemElement, countFieldLength: 8 } }) items : ItemElement[];
                    @Field(8) afterwards;
                }
        
                let bitstream = new BitstreamReader();
                bitstream.addBuffer(Buffer.from([ 123, 3, 1, 2, 11, 12, 21, 22, 123 ]));
        
                let element = await CustomElement.readBlocking(bitstream);
        
                expect(element.before).to.equal(123);
                expect(element.items.length).to.equal(3);
                
                expect(element.items[0].a).to.equal(1);
                expect(element.items[0].b).to.equal(2);
                expect(element.items[1].a).to.equal(11);
                expect(element.items[1].b).to.equal(12);
                expect(element.items[2].a).to.equal(21);
                expect(element.items[2].b).to.equal(22);
                expect(element.afterwards).to.equal(123);
            });
            it('should understand hasMore discriminant', async () => {
                class CustomItem extends BitstreamElement {
                    @Field(8) byte;
                }
        
                class CustomElement extends BitstreamElement {
                    @Field(0, { array: { type: CustomItem, hasMore: a => a.length === 0 || a[a.length - 1].byte !== 0 } })
                    items : CustomItem[];
                }
                let bitstream = new BitstreamReader();
                bitstream.addBuffer(Buffer.from([ 12, 34, 56, 78, 0 ]));
        
                let element = await CustomElement.readBlocking(bitstream);
        
                expect(element.items.length).to.equal(5);
                expect(element.items[0].byte).to.equal(12);
                expect(element.items[1].byte).to.equal(34);
                expect(element.items[2].byte).to.equal(56);
                expect(element.items[3].byte).to.equal(78);
                expect(element.items[4].byte).to.equal(0);
            });
        });
    });
    describe(': Lifecycle Events', it => {
        it(': should call onParseStarted when parsing begins', () => {
            let called = 0;
    
            class CustomElement extends BitstreamElement {
                onParseStarted() {
                    called += 1;
                }
    
                @Field(8) byte;
            }
    
            CustomElement.deserialize(Buffer.alloc(1));
            expect(called).to.equal(1);
        });
        it(': should call onParseFinished when parsing is completed', () => {
            let called = 0;
    
            class CustomElement extends BitstreamElement {
                onParseFinished() { called += 1; }
    
                @Field(8) byte;
            }
    
            CustomElement.deserialize(Buffer.alloc(1));
            expect(called).to.equal(1);
        });
        it(': should call onParseFinished on variant after variation', () => {
            let called = 0;
    
            class CustomElement extends BitstreamElement {
                @Field(8) byte;
            }
    
            @Variant(i => true)
            class CustomElement2 extends CustomElement {
                onParseFinished() { called += 1; }
            }
    
            CustomElement.deserialize(Buffer.alloc(1));
            expect(called).to.equal(1);
        });
        it(': should not call onParseFinished on original after variation', () => {
            let called = 0;
            let subCalled = 0;
    
            class CustomElement extends BitstreamElement {
                onParseFinished() { called += 1; }
    
                @Field(8) byte : number;
            }
    
            @Variant(i => true)
            class CustomElement2 extends CustomElement {
                onParseFinished() { subCalled += 1; }
            }
    
            CustomElement.deserialize(Buffer.alloc(1));
            expect(called).to.equal(0);
            expect(subCalled).to.equal(1);
        });
        it(': should call onParseStarted on both original and variant during variation', () => {
            let called = 0;
    
            class CustomElement extends BitstreamElement {
                onParseStarted() { called += 1; }
    
                @Field(8) byte;
            }
    
            @Variant(i => true)
            class CustomElement2 extends CustomElement {
            }
    
            CustomElement.deserialize(Buffer.alloc(1));
            expect(called).to.equal(2);
        });
        it(': should call onVariationTo on original, but not the variant', () => {
            let called = 0;
    
            class CustomElement extends BitstreamElement {
                onVariationTo() { called += 1; }
    
                @Field(8) byte;
            }
    
            @Variant(i => true)
            class CustomElement2 extends CustomElement {
                onVariationTo() { throw new Error("Should not be called"); }
            }
    
            CustomElement.deserialize(Buffer.alloc(1));
            expect(called).to.equal(1);
        });
        it(': should call onVariationFrom on variant, but not the original', () => {
            let called = 0;
    
            class CustomElement extends BitstreamElement {
                onVariationFrom() { throw new Error("Should not be called"); }
    
                @Field(8) byte;
            }
    
            @Variant(i => true)
            class CustomElement2 extends CustomElement {
                onVariationFrom() { called += 1; }
            }
    
            CustomElement.deserialize(Buffer.alloc(1));
            expect(called).to.equal(1);
        });
        it(': should pass the original to the variant during onVariationFrom', () => {
            let passed;
    
            class CustomElement extends BitstreamElement {
                @Field(8) byte;
    
                whoAmI() { return 'original'; }
            }
    
            @Variant(i => true)
            class CustomElement2 extends CustomElement {
    
                whoAmI() { return 'variant'; }
                onVariationFrom(original) { passed = original; }
            }
    
            CustomElement.deserialize(Buffer.alloc(1));
            expect(passed.whoAmI()).to.equal('original');
        });
        it(': should pass the variant to the original during onVariationTo', () => {
            let passed;
    
            class CustomElement extends BitstreamElement {
                @Field(8) byte;
    
                whoAmI() { return 'original'; }
                onVariationTo(variant) { passed = variant; }
            }
    
            @Variant(i => true)
            class CustomElement2 extends CustomElement {
    
                whoAmI() { return 'variant'; }
            }
    
            CustomElement.deserialize(Buffer.alloc(1));
            expect(passed.whoAmI()).to.equal('variant');
        });
    });
    describe(': Variation', it => {
        it('corrects the select tail variant while reading', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) type : number;
            }

            @Variant(i => i.type === 1)
            class Type1 extends CustomElement {
                @Field(8) value : number;
            }

            @Variant(i => i.type === 2)
            class Type2 extends CustomElement {
                @Field(8) value : number;
            }

            let element : CustomElement;
            
            element = CustomElement.deserialize(Buffer.from([ 1, 123 ]));
            expect(element).to.be.an.instanceOf(Type1);
            expect(element.as(Type1).value).to.equal(123);

            element = CustomElement.deserialize(Buffer.from([ 2, 34 ]));
            expect(element).to.be.an.instanceOf(Type2);
            expect(element.as(Type2).value).to.equal(34);
        });
        it('corrects the select marker variant while reading', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) type : number;
                @VariantMarker() $variantMarker;
                @Field(8) suffix : number;
            }

            @Variant(i => i.type === 1)
            class Type1 extends CustomElement {
                @Field(8) value : number;
            }

            @Variant(i => i.type === 2)
            class Type2 extends CustomElement {
                @Field(8) value : number;
            }

            let element : CustomElement;
            
            element = CustomElement.deserialize(Buffer.from([ 1, 123, 111 ]));
            expect(element).to.be.an.instanceOf(Type1);
            expect(element.as(Type1).value).to.equal(123);
            expect(element.as(Type1).suffix).to.equal(111);

            element = CustomElement.deserialize(Buffer.from([ 2, 22, 112 ]));
            expect(element).to.be.an.instanceOf(Type2);
            expect(element.as(Type2).value).to.equal(22);
            expect(element.as(Type2).suffix).to.equal(112);
        });
        it('respects the priority option', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) type : number;
                @VariantMarker() $variantMarker;
                @Field(8) suffix : number;
            }

            @Variant(i => true, { priority: 1 })
            class Type1 extends CustomElement {
                @Field(8) value : number;
            }

            @Variant(i => true, { priority: 0 })
            class Type2 extends CustomElement {
                @Field(8) value : number;
            }

            let element : CustomElement;
            
            element = CustomElement.deserialize(Buffer.from([ 2, 22, 112 ]));
            expect(element).to.be.an.instanceOf(Type2);
            expect(element.as(Type2).value).to.equal(22);
            expect(element.as(Type2).suffix).to.equal(112);
        });
        it('uses @DefaultVariant() as a last resort', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) type : number;
                @VariantMarker() $variantMarker;
                @Field(8) suffix : number;
            }

            @DefaultVariant()
            class Type1 extends CustomElement {
                @Field(8) value : number;
            }

            @Variant(i => i.type === 2, { priority: 0 })
            class Type2 extends CustomElement {
                @Field(8) value : number;
            }

            let element : CustomElement;
            
            element = CustomElement.deserialize(Buffer.from([ 2, 22, 112 ]));
            expect(element).to.be.an.instanceOf(Type2);
            expect(element.as(Type2).value).to.equal(22);
            expect(element.as(Type2).suffix).to.equal(112);

            element = CustomElement.deserialize(Buffer.from([ 1, 22, 112 ]));
            expect(element).to.be.an.instanceOf(Type1);
            expect(element.as(Type1).value).to.equal(22);
            expect(element.as(Type1).suffix).to.equal(112);
        });
    });
    describe(': Serialization', it => {
        it('supports partial serialization', () => {
            
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
                @Field(8) c : number;
                @Field(8) d : number;
            }

            let buf = new CustomElement().with({ a: 1, b: 2, c: 3, d: 4 }).serialize('b', 'c');
            expect(Array.from(buf)).to.eql([ 2, 3 ]);

            buf = new CustomElement().with({ a: 1, b: 2, c: 3, d: 4 }).serialize('a', 'c');
            expect(Array.from(buf)).to.eql([ 1, 2, 3 ]);
        });
        it('throws when deserializing and buffer is exhausted', () => {
            
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
                @Field(8) c : number;
                @Field(8) d : number;
            }

            let caught;
            try {
                CustomElement.deserialize(Buffer.from([ 7, 8 ]));
            } catch (e) {
                caught = e;
            }

            expect(caught).to.exist;

        });
        it('partial serialization respects presentWhen', () => {
            
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8, { presentWhen: i => false }) b : number;
                @Field(8) c : number;
                @Field(8) d : number;
            }

            let buf = new CustomElement().with({ a: 1, b: 2, c: 3, d: 4 }).serialize('a', 'c');
            expect(Array.from(buf)).to.eql([ 1, 3 ]);

            buf = new CustomElement().with({ a: 1, b: 2, c: 3, d: 4 }).serialize('a', 'd');
            expect(Array.from(buf)).to.eql([ 1, 3, 4 ]);
        });
        it('throws when requesting an invalid partial serialization', () => {
            
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
                @Field(8) c : number;
                @Field(8) d : number;
            }

            let caught;
            try {
                new CustomElement().with({ a: 1, b: 2, c: 3, d: 4 }).serialize('c', 'b');
            } catch (e) {
                caught = e;
            }
            expect(caught).to.exist;
            caught = undefined;
            
            try {
                new CustomElement().with({ a: 1, b: 2, c: 3, d: 4 }).serialize('c', 'a');
            } catch (e) {
                caught = e;
            }
            expect(caught).to.exist;
        });
        it('throws when element is not byte aligned and autoPad=false', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
                @Field(8) c : number;
                @Field(7) d : number;
            }

            let caught;
            try {
                new CustomElement().with({ a: 1, b: 2, c: 3, d: 4 }).serialize();
            } catch (e) {
                caught = e;
            }
            expect(caught).to.exist;
            caught = undefined;
            
            try {
                new CustomElement().with({ a: 1, b: 2, c: 3, d: 4 }).serialize();
            } catch (e) {
                caught = e;
            }
            expect(caught).to.exist;
        });
        it('correctly pads when element is not byte aligned and autoPad=true', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
                @Field(8) c : number;
                @Field(7) d : number;
            }

            let buf = new CustomElement().with({ a: 1, b: 2, c: 3, d: 4 }).serialize(undefined, undefined, true);

            expect(Array.from(buf)).to.eql([1,2,3,4 << 1]);
        });
        it('partial serialization supports type-safe references', () => {
            
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
                @Field(8) c : number;
                @Field(8) d : number;
            }

            let buf = new CustomElement().with({ a: 1, b: 2, c: 3, d: 4 }).serialize(i => i.b, i => i.c);
            expect(Array.from(buf)).to.eql([ 2, 3 ]);

            buf = new CustomElement().with({ a: 1, b: 2, c: 3, d: 4 }).serialize(i => i.a, i => i.c);
            expect(Array.from(buf)).to.eql([ 1, 2, 3 ]);
        });
        it('can read an element synchronously if enough bits are available', () => {
            
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
                @Field(8) c : number;
                @Field(8) d : number;
            }

            let reader = new BitstreamReader();
            reader.addBuffer(Buffer.from([ 1, 2, 3, 4]));

            let result = CustomElement.readSync(reader);

            expect(result.a).to.equal(1);
            expect(result.b).to.equal(2);
            expect(result.c).to.equal(3);
            expect(result.d).to.equal(4);
        });
        it('can try to read an element synchronously', () => {
            
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
                @Field(8) c : number;
                @Field(8) d : number;
            }

            let reader = new BitstreamReader();
            reader.addBuffer(Buffer.from([ 1, 2, 3]));

            let result = CustomElement.tryRead(reader); expect(result).to.be.undefined;
            result = CustomElement.tryRead(reader); expect(result).to.be.undefined;
            result = CustomElement.tryRead(reader); expect(result).to.be.undefined;
            result = CustomElement.tryRead(reader); expect(result).to.be.undefined;
            reader.addBuffer(Buffer.from([ 4 ]));
            result = CustomElement.tryRead(reader); expect(result).not.to.be.undefined;

            expect(result.a).to.equal(1);
            expect(result.b).to.equal(2);
            expect(result.c).to.equal(3);
            expect(result.d).to.equal(4);
        });
        it('trying to read an element that throws during parsing should throw', () => {
            
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
                @Field(8) c : number;
                @Field(i => { throw new Error('uh oh')}) d : number;
            }

            let reader = new BitstreamReader();
            reader.addBuffer(Buffer.from([ 1, 2, 3]));

            let caught;
            try {
                CustomElement.tryRead(reader);
            } catch (e) {
                caught = e;
            }

            expect(caught).to.exist;
        });
        it('when trying to read an element throws, the reader offset should be left where it is', () => {
            
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
                @Field(8) c : number;
                @Field(i => { throw new Error('uh oh')}) d : number;
            }

            let reader = new BitstreamReader();
            reader.addBuffer(Buffer.from([ 0, 1, 2, 3]));

            reader.readSync(8);

            let offset = reader.offset;

            let caught;
            try {
                CustomElement.tryRead(reader);
            } catch (e) {
                caught = e;
            }

            expect(caught).to.exist;
            expect(reader.offset).to.equal(offset);
        });
        it('throws when reading an element synchronously if enough bits are not available', () => {
            
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
                @Field(8) c : number;
                @Field(8) d : number;
            }

            let reader = new BitstreamReader();
            reader.addBuffer(Buffer.from([ 1, 2, 3 ]));
            let caught;
            try {
                CustomElement.readSync(reader);
            } catch (e) {
                caught = e;
            }

            expect(caught).to.exist;
        });
        it('the skip option skips particular fields during deserialization', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
                @Field(8) c : number;
            }

            let element = CustomElement.deserialize(Buffer.from([ 22, 44 ]), { skip: [ 'b' ]});

            expect(element.a).to.equal(22);
            expect(element.b).to.be.undefined;
            expect(element.c).to.equal(44);
        });
    });
    describe(': Measurement', it => {
        it('can measure an element with static field sizes', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) type : number;
                @Field(8) value : number;
                @Field(8) suffix : number;
            }

            expect(new CustomElement().measure()).to.equal(24);
        });
        it('can be used in a determinant', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) a : number;
                @Field(8) b : number;
                @Field(i => i.measure()) c : number;
                @Field(8) d : number;
            }

            let buf = new CustomElement().with({ a: 11, b: 22, c: 33, d: 44 }).serialize();

            expect(Array.from(buf)).to.eql([11, 22, 0, 33, 44]);

            let element = CustomElement.deserialize(Buffer.from([11, 22, 0, 33, 44]));

            expect(element.a).to.equal(11);
            expect(element.b).to.equal(22);
            expect(element.c).to.equal(33);
            expect(element.d).to.equal(44);
        });
        it('measureFrom() works as expected', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) type : number;
                @Field(8) value : number;
                @Field(16) suffix : number;
            }

            expect(new CustomElement().measureFrom('value')).to.equal(24);
        });
        it('measureTo() works as expected', () => {
            class CustomElement extends BitstreamElement {
                @Field(16) type : number;
                @Field(8) value : number;
                @Field(8) suffix : number;
            }

            expect(new CustomElement().measureTo('value')).to.equal(24);
        });
        it('takes determinants into account', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) type : number;
                @Field(i => i.type === 1 ? 8 : 16) value : number;
                @Field(8) suffix : number;
            }

            let element = new CustomElement().with({ type: 1, value: 123, suffix: 117});

            expect(element.measure()).to.equal(24);
            element.type = 2;
            expect(element.measure()).to.equal(32);
        });
        it('correctly computes partial measurements', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) type : number;
                @Field(16) value : number;
                @Field(16) value2 : number;
                @Field(8) suffix : number;
            }

            let element = new CustomElement();

            expect(element.measure('type', 'value')).to.equal(24);
            expect(element.measure('value', 'value2')).to.equal(32);
            expect(element.measure('value', 'suffix')).to.equal(40);
            expect(element.measure('value2', 'suffix')).to.equal(24);
        });
        it('supports type-safe field references', () => {
            class CustomElement extends BitstreamElement {
                @Field(8) type : number;
                @Field(16) value : number;
                @Field(16) value2 : number;
                @Field(8) suffix : number;
            }

            let element = new CustomElement();

            expect(element.measure(i => i.type, i => i.value)).to.equal(24);
            expect(element.measure(i => i.value, i => i.value2)).to.equal(32);
            expect(element.measure(i => i.value, i => i.suffix)).to.equal(40);
            expect(element.measure(i => i.value2, i => i.suffix)).to.equal(24);
        });
    });
    describe(': Context', it => {
        it(': subelements have the same context object as the parent', () => {
            let subObserved;
            let parentObserved;
    
            class SubElement extends BitstreamElement {
                onParseStarted() { subObserved = this.context; }
                @Field(8) byte;
            }
    
            class CustomElement extends BitstreamElement {
                onParseStarted() { parentObserved = this.context; }
                @Field() subelement : SubElement;
            }
    
            CustomElement.deserialize(Buffer.alloc(1));
            expect(subObserved).to.equal(parentObserved);
        });
        it(': sibling elements have the same context object as the parent', () => {
            let subObserved;
            let sub2Observed;
            let parentObserved;
    
            class SubElement extends BitstreamElement {
                onParseStarted() { subObserved = this.context; }
                @Field(8) byte;
            }
            class SubElement2 extends BitstreamElement {
                onParseStarted() { sub2Observed = this.context; }
                @Field(8) byte;
            }
    
            class CustomElement extends BitstreamElement {
                onParseStarted() { parentObserved = this.context; }
                @Field() subelement : SubElement;
                @Field() subelement2 : SubElement2;
            }
    
            CustomElement.deserialize(Buffer.alloc(2));
            expect(subObserved).to.equal(parentObserved);
            expect(sub2Observed).to.equal(parentObserved);
        });
        it(': passed context should be made available to element', () => {
            let observed;
    
            class CustomElement extends BitstreamElement {
                onParseStarted() { observed = this.context; }
                @Field(8) byte : number;
            }
    
            let context = {};
            CustomElement.deserialize(Buffer.alloc(1), { context });
            expect(observed).to.equal(context);
        });
        it(': passed context should be made available to sibling subelements', () => {
            let subObserved;
            let sub2Observed;
            let parentObserved;
    
            class SubElement extends BitstreamElement {
                onParseStarted() { subObserved = this.context; }
                @Field(8) byte;
            }
            class SubElement2 extends BitstreamElement {
                onParseStarted() { sub2Observed = this.context; }
                @Field(8) byte;
            }
    
            class CustomElement extends BitstreamElement {
                onParseStarted() { parentObserved = this.context; }
                @Field() subelement : SubElement;
                @Field() subelement2 : SubElement2;
            }
    
            let context = {};
            CustomElement.deserialize(Buffer.alloc(2), { context });
            expect(parentObserved).to.equal(context);
            expect(subObserved).to.equal(context);
            expect(sub2Observed).to.equal(context);
        });
        it(': context should be shared by parent and array field elements', () => {
            let subObserved;
            let parentObserved;
    
            class SubElement extends BitstreamElement {
                onParseStarted() { subObserved = this.context; }
                @Field(8) byte;
            }
    
            class CustomElement extends BitstreamElement {
                onParseStarted() { parentObserved = this.context; }
                @Field(1, { array: { type: SubElement } }) array : SubElement[];
            }
    
            let element = CustomElement.deserialize(Buffer.alloc(1));
            expect(element.array.length).to.equal(1);
    
            expect(subObserved).to.equal(parentObserved);
        });
        it(': passed context should be made available to array elements', () => {
            let subObserved;
            let parentObserved;
    
            class SubElement extends BitstreamElement {
                onParseStarted() { subObserved = this.context; }
                @Field(8) byte;
            }
    
            class CustomElement extends BitstreamElement {
                onParseStarted() { parentObserved = this.context; }
                @Field(1, { array: { type: SubElement }}) array : SubElement[];
            }
    
            let context = {};
            let element = CustomElement.deserialize(Buffer.alloc(1), { context });
            expect(element.array.length).to.equal(1);
    
            expect(parentObserved).to.equal(context);
            expect(subObserved).to.equal(context);
        });
    });

    describe(': Advanced Serialization', it => {

        describe(': readGroup()', it => {
            it('supports simple grouping', () => {
                class CustomElement extends BitstreamElement {
                    @Field(8, { group: 'a' }) a1 : number;
                    @Field(8, { group: 'b' }) b1 : number;
                    @Field(8, { group: 'a' }) a2 : number;
                    @Field(8, { group: 'b' }) b2 : number;
                    @Field(8, { group: 'a' }) a3 : number;
                    @Field(8, { group: 'b' }) b3 : number;
                    @Field(8, { group: 'a' }) a4 : number;
                    @Field(8, { group: 'b' }) b4 : number;

                    static a(reader : BitstreamReader) {
                        let element = new CustomElement();
                        element.readGroup(reader, 'a').next();
                        return element;
                    }

                    static b(reader : BitstreamReader) {
                        let element = new CustomElement();
                        element.readGroup(reader, 'b').next();
                        return element;
                    }
                }
        
                let buf = Buffer.from([ 0, 1, 2, 3, 4, 5, 6, 7 ]);
                let reader : BitstreamReader;
                let element : CustomElement;

                reader = new BitstreamReader();
                reader.addBuffer(buf);
                element = CustomElement.a(reader);
                expect(element.a1).to.equal(0);
                expect(element.a2).to.equal(1);
                expect(element.a3).to.equal(2);
                expect(element.a4).to.equal(3);
                expect(element.b1).to.be.undefined;
                expect(element.b2).to.be.undefined;
                expect(element.b3).to.be.undefined;
                expect(element.b4).to.be.undefined;

                reader = new BitstreamReader();
                reader.addBuffer(buf);
                element = CustomElement.b(reader);
                expect(element.b1).to.equal(0);
                expect(element.b2).to.equal(1);
                expect(element.b3).to.equal(2);
                expect(element.b4).to.equal(3);
                expect(element.a1).to.be.undefined;
                expect(element.a2).to.be.undefined;
                expect(element.a3).to.be.undefined;
                expect(element.a4).to.be.undefined;
            });
            it('supports "all" grouping', () => {
                class CustomElement extends BitstreamElement {
                    @Field(8, { group: 'a' }) a1 : number;
                    @Field(8, { group: 'b' }) b1 : number;
                    @Field(8, { group: 'a' }) a2 : number;
                    @Field(8, { group: 'b' }) b2 : number;
                    @Field(8, { group: 'a' }) a3 : number;
                    @Field(8, { group: 'b' }) b3 : number;
                    @Field(8, { group: 'a' }) a4 : number;
                    @Field(8, { group: 'b' }) b4 : number;

                    static custom(reader : BitstreamReader) {
                        let element = new CustomElement();
                        element.readGroup(reader, '*').next();
                        return element;
                    }
                }
        
                let buf = Buffer.from([ 0, 1, 2, 3, 4, 5, 6, 7 ]);
                let reader : BitstreamReader;
                let element : CustomElement;

                reader = new BitstreamReader();
                reader.addBuffer(buf);
                element = CustomElement.custom(reader);
                expect(element.a1).to.equal(0);
                expect(element.a2).to.equal(2);
                expect(element.a3).to.equal(4);
                expect(element.a4).to.equal(6);
                expect(element.b1).to.equal(1);
                expect(element.b2).to.equal(3);
                expect(element.b3).to.equal(5);
                expect(element.b4).to.equal(7);
            });
            it('supports "own" grouping', () => {
                class CustomElement extends BitstreamElement {
                    @Field(8) a : number;
                }

                class CustomElement2 extends CustomElement {
                    @Field(8) b : number;

                    static own(reader : BitstreamReader) {
                        let element = new CustomElement2();
                        element.readGroup(reader, '$*').next();
                        return element;
                    }
                }
        
                let buf = Buffer.from([ 33, 1, 2, 3, 4, 5, 6, 7 ]);
                let reader : BitstreamReader;
                let element : CustomElement2;

                reader = new BitstreamReader();
                reader.addBuffer(buf);
                element = CustomElement2.own(reader);

                expect(element.a).to.be.undefined;
                expect(element.b).to.equal(33);
            })
        });
        describe('readOwn()', it => {
            it('reads all fields', () => {
                class CustomElement extends BitstreamElement {
                    @Field(8, { group: 'a' }) a1 : number;
                    @Field(8, { group: 'b' }) b1 : number;
                    @Field(8, { group: 'a' }) a2 : number;
                    @Field(8, { group: 'b' }) b2 : number;
                    @Field(8, { group: 'a' }) a3 : number;
                    @Field(8, { group: 'b' }) b3 : number;
                    @Field(8, { group: 'a' }) a4 : number;
                    @Field(8, { group: 'b' }) b4 : number;

                    static custom(reader : BitstreamReader) {
                        let element = new CustomElement();
                        element.readOwn(reader).next();
                        return element;
                    }
                }
        
                let buf = Buffer.from([ 0, 1, 2, 3, 4, 5, 6, 7 ]);
                let reader : BitstreamReader;
                let element : CustomElement;

                reader = new BitstreamReader();
                reader.addBuffer(buf);
                element = CustomElement.custom(reader);
                expect(element.a1).to.equal(0);
                expect(element.a2).to.equal(2);
                expect(element.a3).to.equal(4);
                expect(element.a4).to.equal(6);
                expect(element.b1).to.equal(1);
                expect(element.b2).to.equal(3);
                expect(element.b3).to.equal(5);
                expect(element.b4).to.equal(7);
            });
        });
        it('supports allowing exhaustion when deserializing', () => {
            class ContainerElement extends BitstreamElement {
                @Field(8) byte : number;
            }

            class Container extends BitstreamElement {
                @Field(0, { array: { type: ContainerElement, hasMore: i => true }})
                elements : ContainerElement[];
            }

            let value = Container.deserialize(Buffer.from([0,1,2,3,4,5,6,7]), { allowExhaustion: true });

            expect(value.elements.length).to.equal(8);
            for (let i = 0, max = 8; i < max; ++i)
                expect(value.elements[i].byte, `value at index ${i} should be ${i}`).to.equal(i);
        });
    });
})