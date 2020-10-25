import { Constructor } from "./constructor";
import { BitstreamReader } from "./reader";
import { BitstreamSyntaxElement } from "./syntax-element";

export class BitstreamElement {
    static get syntax() : BitstreamSyntaxElement[] {
        return (Object.getPrototypeOf(this).syntax || []).concat(this.ownSyntax || []);
    }

    static ownSyntax : BitstreamSyntaxElement[];

    get syntax() : BitstreamSyntaxElement[] {
        return (this.constructor as any).syntax;
    }

    protected async deserializeGroup(bitstream : BitstreamReader, name : string) {
        let syntax = this.syntax;

        for (let element of syntax) {
            if (name !== '*' && element.options.group !== name)
                continue;
            
            try {
                this[element.name] = await element.options.deserializer(bitstream, element, this);
            } catch (thrown) {
                let e : Error = thrown;
                if (e.message.startsWith('underrun:')) {
                    throw new Error(
                        `Ran out of bits while deserializing field ${element.name} ` 
                        + `in group '${name}' ` 
                        + `of element ${this.constructor.name}`
                    );
                } else {
                    throw e;
                }
            }
        }
    }

    async deserializeFrom(bitstream : BitstreamReader) {
        await this.deserializeGroup(bitstream, '*');
    }

    static async deserialize<T extends BitstreamElement>(this : Constructor<T>, bitstream : BitstreamReader) : Promise<T> {
        let instance = new this();
        await instance.deserializeFrom(bitstream);
        return instance;
    }
}
