import { Constructor } from "./constructor";
import { BitstreamReader } from "./reader";
import { FieldDefinition } from "./syntax-element";
import { BitstreamWriter } from "./writer";

export class BitstreamElement {
    static get syntax() : FieldDefinition[] {

        let self : Object = this;
        let ownSyntax = [];
        if (self.hasOwnProperty('ownSyntax'))
            ownSyntax = this.ownSyntax;

        return (Object.getPrototypeOf(this).syntax || []).concat(ownSyntax || []);
    }

    static ownSyntax : FieldDefinition[];

    get syntax() : FieldDefinition[] {
        return (this.constructor as any).syntax;
    }

    protected async readGroup(bitstream : BitstreamReader, name : string) {
        let syntax = this.syntax;

        if (globalThis.BITSTREAM_TRACE === true)
            console.log(`[readGroup] ${this.constructor.name}, name=${name}`);
        
        for (let element of syntax) {
            if (name !== '*' && element.options.group !== name)
                continue;
        
            let traceTimeout;
            if (globalThis.BITSTREAM_TRACE === true) {
                traceTimeout = setTimeout(() => {
                    console.log(`Stuck reading ${element.containingType.name}#${element.name}`);
                }, 5000);
            }

            try {
                if (globalThis.BITSTREAM_TRACE === true)
                    console.log(` - ${element.containingType.name}#${element.name}`);
                this[element.name] = await element.options.serializer.read(bitstream, element, this);
                if (globalThis.BITSTREAM_TRACE === true) {
                    console.log(`   => ${this[element.name]} [${element.containingType.name}#${element.name}]`);
                    clearTimeout(traceTimeout);
                }
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
