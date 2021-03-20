import { WritableStreamBuffer } from "stream-buffers";
import { Constructor } from "./constructor";
import { StructureSerializer } from "./field";
import { BitstreamReader } from "./reader";
import { FieldDefinition } from "./syntax-element";
import { VariantDefinition } from "./variant";
import { BitstreamMeasurer, BitstreamWriter } from "./writer";

export type FieldRef<T> = string | symbol | ((exemplar : {
    [P in keyof T]: any;
}) => any);

export class BitstreamElement {
    static get syntax() : FieldDefinition[] {
        let parentSyntax = (<FieldDefinition[]>(Object.getPrototypeOf(this).syntax || []));
        let syntax = parentSyntax.slice();
        let ownSyntax = (<Object>this).hasOwnProperty('ownSyntax') ? this.ownSyntax : [];
        let insertIndex = syntax.findIndex(x => x.options.isVariantMarker);

        if (insertIndex >= 0)
            syntax.splice(insertIndex, 0, ...ownSyntax);
        else
            syntax.push(...ownSyntax);

        return syntax;
    }

    clone(): this {
        let newInstance = new (<any>this.constructor)();

        for (let field of this.syntax)
            newInstance[field.name] = this[field.name];

        return newInstance;
    }

    selectField(ref : FieldRef<this>) {
        if (typeof ref === 'string' || typeof ref === 'symbol')
            return this.syntax.find(x => x.name === ref);

        let selector : Record<string, symbol> = this.syntax.reduce((pv, cv) => (pv[cv.name] = cv.name, pv), {});
        let selected : string = ref(<any>selector);

        return this.syntax.find(x => x.name === selected);
    }

    /**
     * Serialize all fields or a subset of fields into a Buffer. 
     * @param fromRef 
     * @param toRef 
     * @param autoPad When true and the bitsize of a field is not a multiple of 8, the final byte will 
     *                contain zeros up to the next byte. When false (default), serialize() will throw
     *                if the size is not a multiple of 8.
     */
    serialize(fromRef? : FieldRef<this>, toRef? : FieldRef<this>, autoPad = false) {
        if (!fromRef)
            fromRef = this.syntax[0].name;

        if (!toRef) {
            if (this.getFieldBeingComputed()) {
                let toIndex = this.syntax.findIndex(f => f.name === this.getFieldBeingComputed().name);

                if (!this.getFieldBeingComputedIntrospectable())
                    toIndex -= 1;
                
                if (toIndex < 0)
                    return Buffer.alloc(0);
                
                toRef = this.syntax[toIndex].name;
            } else if (this.isBeingRead) {
                //console.log(`${this.constructor.name}: Autodetermining last read field from ${JSON.stringify(this.readFields)}`);
                let readFields = this.syntax.filter(x => this.readFields.includes(x.name)).map(x => x.name);
                toRef = readFields[readFields.length - 1];
                //console.log(`${this.constructor.name}: Selected ${String(readFields[readFields.length - 1])} as end of measure range`);
            } else {
                //console.log(`${this.constructor.name} is not being read, so grabbing last field`);
                toRef = this.syntax[this.syntax.length - 1].name;
            }
        }

        let from = this.selectField(fromRef);
        let to = this.selectField(toRef);
        let fromIndex = this.syntax.findIndex(x => x === from);
        let toIndex = this.syntax.findIndex(x => x === to);

        let stream = new WritableStreamBuffer();
        let writer = new BitstreamWriter(stream);

        if (fromIndex > toIndex) {
            throw new Error(`Cannot measure from field ${fromIndex} (${String(from.name)}) to ${toIndex} (${String(to.name)}): First field comes after last field`);
        }

        let length = this.measure(fromRef, toRef);

        if (!autoPad && length % 8 !== 0)
            throw new Error(`Cannot serialize ${length} bits evenly into ${Math.ceil(length / 8)} bytes`);

        //console.log(`Measuring from ${String(from.name)} [${fromIndex}] to ${String(to.name)} [${toIndex}]`);

        for (let i = fromIndex, max = toIndex; i <= max; ++i) {
            let field = this.syntax[i];

            if (!this.isPresent(field, this))
                continue;

            let writtenValue = this[field.name];

            if (field.options.writtenValue) {
                if (typeof field.options.writtenValue === 'function') {
                    writtenValue = field.options.writtenValue(this, field);
                } else {
                    writtenValue = field.options.writtenValue;
                }
            }

            try {
                field.options.serializer.write(writer, field.type, this, field, writtenValue);
            } catch (e) {
                console.error(`Failed to write field ${field.type.name}#${String(field.name)} using ${field.options.serializer.constructor.name}: ${e.message}`);
                console.error(e);
                throw new Error(`Failed to write field ${String(field.name)} using ${field.options.serializer.constructor.name}: ${e.message}`);
            }
        }

        return <Buffer>stream.getContents();
    }

    measure(fromRef? : FieldRef<this>, toRef? : FieldRef<this>) {
        if (!fromRef)
            fromRef = this.syntax[0].name;

        if (!toRef) {
            if (this.getFieldBeingComputed()) {
                let toIndex = this.syntax.findIndex(f => f.name === this.getFieldBeingComputed().name);

                if (!this.getFieldBeingComputedIntrospectable())
                    toIndex -= 1;
                
                if (toIndex < 0)
                    return 0;
                
                toRef = this.syntax[toIndex].name;
            } else if (this.isBeingRead) {
                //console.log(`${this.constructor.name}: Autodetermining last read field from ${JSON.stringify(this.readFields)}`);
                let readFields = this.syntax.filter(x => this.readFields.includes(x.name)).map(x => x.name);
                toRef = readFields[readFields.length - 1];
                //console.log(`${this.constructor.name}: Selected ${String(readFields[readFields.length - 1])} as end of measure range`);
            } else {
                //console.log(`${this.constructor.name} is not being read, so grabbing last field`);
                toRef = this.syntax[this.syntax.length - 1].name;
            }
        }

        let from = this.selectField(fromRef);
        let to = this.selectField(toRef);
        let fieldBeingRead = this.syntax.find(x => !this.readFields.includes(x.name));

        let fromIndex = this.syntax.findIndex(x => x === from);
        let toIndex = this.syntax.findIndex(x => x === to);
        let measurer = new BitstreamMeasurer();

        if (fromIndex > toIndex) {
            throw new Error(`Cannot measure from field ${fromIndex} (${String(from.name)}) to ${toIndex} (${String(to.name)}): First field comes after last field`);
        }

        //console.log(`Measuring from ${String(from.name)} [${fromIndex}] to ${String(to.name)} [${toIndex}]`);

        for (let i = fromIndex, max = toIndex; i <= max; ++i) {
            let field = this.syntax[i];

            if (!this.isPresent(field, this))
                continue;

            try {
                field.options.serializer.write(measurer, this.constructor, this, field, this[field.name]);
            } catch (e) {
                console.error(`Failed to measure field ${this.constructor.name}#${String(field.name)}:`);
                console.error(e);
                throw new Error(`${this.constructor.name}#${String(field.name)}: Cannot measure field: ${e.message}`);
            }
        }

        //console.log(`${this.constructor.name}#${String(fieldBeingRead?.name) || '<none>'}: Measure('${String(from.name)}', '${String(to.name)}'): ${measurer.bitLength} bits`);
        return measurer.bitLength;
    }
    
    measureTo(toRef? : FieldRef<this>) {
        return this.measure(undefined, toRef);
    }

    measureFrom(fromRef? : FieldRef<this>) {
        return this.measure(fromRef, undefined);
    }

    measureField(ref? : FieldRef<this>) {
        return this.measure(ref, ref);
    }

    as<T>(...typeChecks : Constructor<T>[]): T {
        if (!typeChecks.some(x => this instanceof x))
            throw new Error(`Tried to cast to one of [${typeChecks.map(x => x.name).join(', ')}], but ${this.constructor.name} does not inherit from any of them`);

        return <any>this;
    }

    static get variants() : VariantDefinition[] {
        return (<Object>this).hasOwnProperty('ownVariants') ? this.ownVariants : [];
        // return (Object.getPrototypeOf(this).variants || [])
        //     .concat((<Object>this).hasOwnProperty('ownVariants') ? this.ownVariants : [])
        // ;
    }

    static ownVariants : VariantDefinition[];
    static ownSyntax : FieldDefinition[];

    #parent : BitstreamElement;

    get parent() {
        return this.#parent;
    }

    set parent(value) {
        this.#parent = value;
    }

    #readFields : (string | symbol)[] = [];
    #isBeingRead : boolean;

    get isBeingRead() {
        return this.#isBeingRead;
    }

    set isBeingRead(value : boolean) {
        this.#isBeingRead = value;
    }

    get readFields() {
        return this.#readFields;
    }

    #fieldBeingComputed : FieldDefinition;
    #fieldBeingComputedIntrospectable : boolean;

    getFieldBeingComputedIntrospectable() {
        return this.#fieldBeingComputedIntrospectable;
    }

    getFieldBeingComputed() {
        return this.#fieldBeingComputed;
    }

    toJSON() {
        return this.syntax
            .map(s => [s.name, this[s.name]])
            .reduce((pv, [k, v]) => (pv[k] = v, pv), {});
    }

    runWithFieldBeingComputed<T>(field : FieldDefinition, callback : () => T, introspectable? : boolean) {
        let before = this.getFieldBeingComputed();
        let beforeIntrospectable = this.getFieldBeingComputedIntrospectable();
        try {
            this.#fieldBeingComputed = field;
            this.#fieldBeingComputedIntrospectable = introspectable;
            return callback();
        } finally { 
            this.#fieldBeingComputed = before;
            this.#fieldBeingComputedIntrospectable = beforeIntrospectable;
        }
    }

    get syntax() : FieldDefinition[] {
        return (this.constructor as any).syntax;
    }

    get ownSyntax() : FieldDefinition[] {
        return (this.constructor as any).ownSyntax;
    }

    private leftPad(num : number | string, digits : number = 4) {
        let str = `${num}`;
        while (str.length < digits)
            str = ` ${str}`;
        return str;
    }

    private rightPad(num : number | string, digits : number = 4) {
        let str = `${num}`;
        while (str.length < digits)
            str = `${str} `;
        return str;
    }

    private zeroPad(num : number | string, digits : number = 4) {
        let str = `${num}`;
        while (str.length < digits)
            str = `0${str}`;
        return str;
    }

    private isPresent(element : FieldDefinition, instance : this) {
        if (element.options.presentWhen) {
            if (!instance.runWithFieldBeingComputed(element, () => element.options.presentWhen(instance))) {
                //console.log(`${this.constructor.name}#${String(element.name)}: Skipping field [presentWhen failed]`);
                return false;
            }
        }

        if (element.options.excludedWhen) {
            if (instance.runWithFieldBeingComputed(element, () => element.options.excludedWhen(instance))) {
                //console.log(`${this.constructor.name}#${String(element.name)}: Skipping field [excludedWhen passed]`);
                return false;
            }
        }

        return true;
    }

    protected async readGroup(bitstream : BitstreamReader, name : string, variator : () => Promise<this>) {
        let syntax : FieldDefinition[];
        
        if (name === '*') { // all my fields
            syntax = this.syntax;
        } else if (name === '$*') { // all my own fields
            syntax = this.ownSyntax;
        } else if (name.startsWith('$')) { // my own fields in group $<group>
            // if (name !== '*' && element.options.group !== name)
            let group = name.slice(1);
            syntax = this.ownSyntax.filter(x => x.options.group === group);
        } else { // all my fields in group <group>
            syntax = this.ownSyntax.filter(x => x.options.group === name);
        }

        let instance = this;

        for (let element of syntax) {

            // Preconditions 

            if (!this.isPresent(element, instance))
                continue;
                
            if (element.options.isVariantMarker && variator) {
                if (globalThis.BITSTREAM_TRACE)
                    console.log(`Variating at marker...`);
                instance = await variator();
                if (!instance)
                    throw new Error(`Variator did not return a value!`);
                
                continue;
            }

            // Parsing 

            let traceTimeout;
            if (globalThis.BITSTREAM_TRACE === true) {
                traceTimeout = setTimeout(() => {
                    console.log(`[!!] ${element.containingType.name}#${String(element.name)}: Stuck reading!`);
                }, 5000);
            }

            try {
                let readValue = await element.options.serializer.read(bitstream, element.type, instance, element);
                if (!element.options.isIgnored)
                    instance[element.name] = readValue;
                instance.readFields.push(element.name);

                let displayedValue = `${readValue}`;

                if (typeof readValue === 'number') {
                    displayedValue = `0x${readValue.toString(16)} [${readValue}]`;
                }

                if (globalThis.BITSTREAM_TRACE === true) {
                    try {
                        console.log(
                            `[ + ${
                                this.leftPad(instance.measureField(element.name), 4)
                                } bit(s) = ${
                                    this.leftPad(Math.floor(instance.measureTo(element.name) / 8), 4)
                                } byte(s), ${
                                    this.leftPad(
                                        instance.measureTo(element.name)
                                        - Math.floor(instance.measureTo(element.name) / 8)*8
                                    , 4)
                                } bits = ${this.leftPad(instance.measureTo(element.name), 4)} bits total] `
                            + 
                            `   ${this.rightPad(`${element.containingType.name}#${String(element.name)}`, 50)} => ${displayedValue}`
                        );
                    } catch (e) {
                        console.log(`Error while tracing read operation for element ${String(element.name)}: ${e.message}`);
                        console.error(e);
                    }

                    clearTimeout(traceTimeout);
                }
            } catch (thrown) {
                let e : Error = thrown;
                if (e.message.startsWith('underrun:')) {
                    throw new Error(
                        `Ran out of bits while deserializing field ${String(element.name)} ` 
                        + `in group '${name}' ` 
                        + `of element ${instance.constructor.name}`
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
            
            // Preconditions 

            if (!this.isPresent(element, this))
                continue;

            let writtenValue = this[element.name];

            if (element.options.writtenValue) {
                if (typeof element.options.writtenValue === 'function') {
                    writtenValue = element.options.writtenValue(this, element);
                } else {
                    writtenValue = element.options.writtenValue;
                }
            }

            try {
                element.options.serializer.write(bitstream, element.type, this, element, writtenValue);
            } catch (e) {
                console.error(`Failed to write field ${element.type.name}#${String(element.name)} using ${element.options.serializer.constructor.name}: ${e.message}`);
                console.error(e);
                throw new Error(`Failed to write field ${String(element.name)} using ${element.options.serializer.constructor.name}: ${e.message}`);
            }
        }
    }

    async read(bitstream : BitstreamReader, variator? : () => Promise<this>) {
        await this.readGroup(bitstream, '*', variator);
    }

    async readOwn(bitstream : BitstreamReader, variator? : () => Promise<this>) {
        await this.readGroup(bitstream, '$*', variator);
    }

    static async read<T extends BitstreamElement>(this : Constructor<T>, bitstream : BitstreamReader, parent? : BitstreamElement) : Promise<T> {
        return <any> await new StructureSerializer().read(bitstream, this, null, null);
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
