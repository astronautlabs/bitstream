import { expect } from "chai";
import { describe } from "razmin";
import { BitstreamElement } from "./element";
import { Field } from "./field";
import { resolveLength } from "./resolve-length";

describe('resolveLength()', it => {
    class CustomElement extends BitstreamElement {
        @Field(8) a : number;
    }
    class ContainerElement extends BitstreamElement {
        @Field() custom : CustomElement;
    }

    const element = new CustomElement().with({ a: 32 });
    const container = new ContainerElement();

    element.parent = container;
    const aField = CustomElement.syntax.find(x => x.name === 'a');

    it('should execute the determinant and return its value', () => {
        expect(resolveLength(i => i.a, element, aField)).to.equal(32);
    });
    it('should throw with determinant and no instance', () => {
        let caught;

        try {
            resolveLength(i => i.a, undefined, undefined);
        } catch (e) { caught = e; }

        expect(caught).to.exist;
    });
    it('should throw when determinant returns negative value', () => {
        const consoleT = console;

        try {
            (globalThis as any).console = { 
                log() { },
                error() { },
                dir() { }
            }

            let caught;
            try {
                resolveLength(i => -1, element, aField);
            } catch (e) { caught = e; }

            expect(caught).to.exist;
            expect(caught.message).to.contain('Length determinant returned negative value');

        } finally {
            (globalThis as any).console = consoleT;
        }
    });
    it('should recognize and return literal values', () => {
        expect(resolveLength(100, element, aField)).to.equal(100);
    });
    it('should support literals even when no instance is available', () => {
        expect(resolveLength(100, undefined, undefined)).to.equal(100);
    });
});