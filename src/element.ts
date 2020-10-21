import { Constructor } from "./constructor";
import { BitstreamReader } from "./reader";
import { BitstreamSyntaxElement } from "./syntax-element";

export class BitstreamElement {
    static bitLength : number = 0;
    static syntax : BitstreamSyntaxElement[] = [];

    get syntax() : BitstreamSyntaxElement[] {
        return (this.constructor as any).syntax;
    }

    protected deserializeGroup(bitstream : BitstreamReader, name : string) {
        for (let element of (<BitstreamSyntaxElement[]>(this.constructor as any).syntax)) {
            if (name === '*' || element.options.group === name) {
                this[element.name] = element.options.deserializer(bitstream.readSync(element.length));
            }
        }
    }

    protected deserializeFrom(bitstream : BitstreamReader) {
        this.deserializeGroup(bitstream, '*');
    }

    static deserializeSync<T extends BitstreamElement>(this : Constructor<T>, bitstream : BitstreamReader) : T {
        let instance = new this();
        instance.deserializeFrom(bitstream);
        return instance;
    }
}
