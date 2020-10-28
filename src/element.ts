import { Constructor } from "./constructor";
import { BitstreamReader } from "./reader";
import { FieldDefinition } from "./syntax-element";
import { BitstreamWriter } from "./writer";

export class BitstreamElement {
    static get syntax() : FieldDefinition[] {
        return (Object.getPrototypeOf(this).syntax || []).concat(this.ownSyntax || []);
    }

    static ownSyntax : FieldDefinition[];

    get syntax() : FieldDefinition[] {
        return (this.constructor as any).syntax;
    }

    protected async readGroup(bitstream : BitstreamReader, name : string) {
        let syntax = this.syntax;

        for (let element of syntax) {
            if (name !== '*' && element.options.group !== name)
                continue;
            
            try {
                this[element.name] = await element.options.serializer.read(bitstream, element, this);
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

    protected async writeGroup(bitstream : BitstreamWriter, name : string) {
        let syntax = this.syntax;
        for (let element of syntax) {
            if (name !== '*' && element.options.group !== name)
                continue;
            
            element.options.serializer.write(bitstream, element, this[element.name], this);
        }
    }

    async read(bitstream : BitstreamReader) {
        await this.readGroup(bitstream, '*');
    }

    static async read<T extends BitstreamElement>(this : Constructor<T>, bitstream : BitstreamReader) : Promise<T> {
        let instance = new this();
        await instance.read(bitstream);
        return instance;
    }

    async write(bitstream : BitstreamWriter) {
        await this.writeGroup(bitstream, '*');
    }

    /**
     * Apply the given properties to this object 
     * and return ourself.
     * 
     * @param this 
     * @param changes 
     */
    with<T>(this : T, changes : Partial<T>): T {
        Object.assign(this, changes);
        return this;
    }
}
