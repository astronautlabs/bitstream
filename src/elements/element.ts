import { WritableStreamBuffer } from "stream-buffers";
import { BitstreamMeasurer, BitstreamReader, BitstreamWriter } from "../bitstream";
import { Constructor } from "../common";
import { StructureSerializer } from "./structure-serializer";
import { FieldDefinition } from "./field-definition";
import { VariantDefinition } from "./variant-definition";

/**
 * A reference to a field. Can be a string/symbol or a type-safe function 
 * which exemplifies the field.
 */
export type FieldRef<T> = string | symbol | ((exemplar : {
    [P in keyof T]: any;
}) => any);

/**
 * Specify options when serializing a value
 */
export interface SerializeOptions {
    /**
     * Set of fields to skip while writing
     */
    skip? : (string | symbol)[];
}

/**
 * BitstreamElement is a base class which can be extended to produce "structures" that can be 
 * read from and written to a bitstream. It allows you to specify fields along with their type
 * and bitlength information declaratively, allowing BitstreamElement itself to handle the actual
 * serialization/deserialization in the context of a passed BitstreamReader/BitstreamWriter.
 */
export class BitstreamElement {
    /**
     * Retrieve the "syntax" of this element, which is the list of fields defined on the element 
     * in order of appearance within the bitstream.
     */
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

    /**
     * Create a copy of this element instance
     * @returns A new copy of this element
     */
    clone(): this {
        let newInstance = new (<any>this.constructor)();

        for (let field of this.syntax)
            newInstance[field.name] = this[field.name];

        return newInstance;
    }

    /**
     * Retrieve the field definition of a field as specified by the given field reference
     * @param ref The field being referenced
     * @returns The field definition
     */
    selectField(ref : FieldRef<this>) {
        if (typeof ref === 'string' || typeof ref === 'symbol')
            return this.syntax.find(x => x.name === ref);

        let selector : Record<string, symbol> = this.syntax.reduce((pv, cv) => (pv[cv.name] = cv.name, pv), {});
        let selected : string = ref(<any>selector);

        return this.syntax.find(x => x.name === selected);
    }

    /**
     * Serialize all fields or a subset of fields into a Buffer. 
     * @param fromRef The first field that should be serialized. If not specified, serialization begins at the start of
     *                  the element
     * @param toRef The last field that should be serialized. If not specified, serialization continues until the end of
     *                  the element 
     * @param autoPad When true and the bitsize of a field is not a multiple of 8, the final byte will 
     *                  contain zeros up to the next byte. When false (default), serialize() will throw
     *                  if the size is not a multiple of 8.
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
                let readFields = this.syntax.filter(x => this.readFields.includes(x.name)).map(x => x.name);
                toRef = readFields[readFields.length - 1];
            } else {
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

        writer.end();

        return <Buffer>stream.getContents();
    }

    /**
     * Measure the number of bits starting from the first field and continuing through the structure until the last 
     * field. 
     * @param fromRef The field to start measuring from (including the specified field). When not specified, measurement
     *                  starts from the first field
     * @param toRef The field to stop measuring at (including the specified field). When not specified, measurement 
     *                  ends at the last field
     * @returns The number of bits occupied by the range of fields
     */
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
                let readFields = this.syntax.filter(x => this.readFields.includes(x.name)).map(x => x.name);
                toRef = readFields[readFields.length - 1];
            } else {
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

        return measurer.bitLength;
    }
    
    /**
     * Measure from the beginning of the element to the given field
     * @param toRef The field to stop measuring at (including the specified field)
     * @returns The number of bits occupied by the set of fields
     */
    measureTo(toRef? : FieldRef<this>) {
        return this.measure(undefined, toRef);
    }

    /**
     * Measure from the given field to the end of the element
     * @param fromRef The field to start measuing at (including the specified field)
     * @returns The number of bits occupied by the set of fields
     */
    measureFrom(fromRef? : FieldRef<this>) {
        return this.measure(fromRef, undefined);
    }

    /**
     * Measure the size of a specific field
     * @param ref The field to measure
     * @returns The number of bits occupied by the field
     */
    measureField(ref? : FieldRef<this>) {
        return this.measure(ref, ref);
    }

    /**
     * Check that this instance is one of a set of given subtypes. If it is,
     * this instance is returned with the more specific type. 
     * If it is not, an error is thrown.
     * 
     * @param typeChecks One or more subclasses to check
     * @returns This instance, but casted to the desired type
     */
    as<T>(...typeChecks : Constructor<T>[]): T {
        if (!typeChecks.some(x => this instanceof x))
            throw new Error(`Tried to cast to one of [${typeChecks.map(x => x.name).join(', ')}], but ${this.constructor.name} does not inherit from any of them`);

        return <any>this;
    }

    /**
     * Check that this instance is one of a set of given subtypes.
     * @param typeChecks 
     * @returns 
     */
    is<T>(...typeChecks : Constructor<T>[]): this is T {
        return typeChecks.some(x => this instanceof x);
    }

    /**
     * Retrieve the set of defined variants for this element class
     */
    static get variants() : VariantDefinition[] {
        return (<Object>this).hasOwnProperty('ownVariants') ? this.ownVariants : [];
    }

    /**
     * Retrieve the set of variants for this specific class, excluding those 
     * of its superclasses
     */
    static ownVariants : VariantDefinition[];

    /**
     * Retrieve the syntax defined for this specific class, excluding the syntax
     * defined by its superclasses
     */
    static ownSyntax : FieldDefinition[];

    #parent : BitstreamElement;

    /**
     * Retrieve the element which contains this element, if any
     */
    get parent() {
        return this.#parent;
    }

    /**
     * Set the parent element of this element
     */
    set parent(value) {
        this.#parent = value;
    }

    #readFields : (string | symbol)[] = [];
    #isBeingRead : boolean;

    /**
     * True when this element is currently being read, false otherwise
     */
    get isBeingRead() {
        return this.#isBeingRead;
    }

    /**
     * Set whether this element is currently being read
     */
    set isBeingRead(value : boolean) {
        this.#isBeingRead = value;
    }

    /**
     * Retrieve the set of field names which has been read so far
     */
    get readFields() {
        return this.#readFields;
    }

    #fieldBeingComputed : FieldDefinition;
    #fieldBeingComputedIntrospectable : boolean;

    /**
     * Determine if the field currently being computed is introspectable,
     * meaning that the bits it has read so far will be considered during measurement,
     * even though it possibly has not finished reading all bits it will read yet
     * @returns 
     */
    getFieldBeingComputedIntrospectable() {
        return this.#fieldBeingComputedIntrospectable;
    }

    /**
     * Get the definition of the field currently being computed, if any.
     * @returns 
     */
    getFieldBeingComputed() {
        return this.#fieldBeingComputed;
    }

    /**
     * Convert this element to a JSON-compatible representation which contains 
     * only the fields defined on the element (aka its "syntax")
     */
    toJSON() {
        return this.syntax
            .map(s => [s.name, this[s.name]])
            .reduce((pv, [k, v]) => (pv[k] = v, pv), {});
    }

    /**
     * Run the given callback while in a state where the given field is considered to be the one "being computed",
     * which is primarily used to enable the current size of arrays as they are read in cases where the count of 
     * items in the array is dependent on the overall bitlength of the previous elements that have been read. See
     * the `hasMore` option of ArrayOptions
     * 
     * @param field The field being computed
     * @param callback The function to run
     * @param introspectable When true, the computed field is marked as introspectable
     */
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

    /**
     * Get the "syntax" of this element instance; this is the set of fields that compose the element, in order.
     */
    get syntax() : FieldDefinition[] {
        return (this.constructor as any).syntax;
    }

    /**
     * Get the "syntax" of this element instance excluding syntax defined by its superclasses; this is the 
     * set of fields that compose the elemnet, in order.
     */
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
                return false;
            }
        }

        if (element.options.excludedWhen) {
            if (instance.runWithFieldBeingComputed(element, () => element.options.excludedWhen(instance))) {
                return false;
            }
        }

        return true;
    }

    /**
     * Read a specific group of fields from the bitstream and serialize their values into this instance. This is called
     * by BitstreamElement for you, but can be used when overriding the default read behavior.
     * @param bitstream The bitstream reader to read from
     * @param name The name of the group to read. Some special values are accepted: '*' means all fields, '$*' means all
     *              fields defined directly on this class (excluding its superclasses). Other group specifiers starting 
     *              with '$' match fields defined directly on this class which are part of the specified group (for 
     *              instance '$foo' matches directly defined fields in the 'foo' group). Otherwise, the string is 
     *              matched directly against the 'group' option of all fields.
     * @param variator A function which implements variation of this instance in the case where a `@VariantMarker` is 
     *              encountered. The function should determine an appropriate variant and return it; when it does so,
     *              the group will continue to be read after the marker, but the results of reading the field will be
     *              applied to the returned instance instead of this instance
     * @param options Serialization options that modify how the group is read. Most notably this allows you to skip 
     *              specific fields.
     */
    protected async readGroup(bitstream : BitstreamReader, name : string, variator : () => Promise<this>, options? : SerializeOptions) {
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
                
            if (options?.skip && options.skip.includes(element.name))
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

    /**
     * Write a group of fields to the given bitstream writer. This is used by BitstreamElement internally, but it can 
     * be called directly when overriding the default write behavior in a subclass, if desired. 
     * @param bitstream The bitstream writer to write the fields to
     * @param name The name of the group to write. 
     * @param options Options that modify how the group is written. Most notably this allows you to skip specific 
     *                  fields.
     */
    protected writeGroup(bitstream : BitstreamWriter, name : string, options? : SerializeOptions) {
        let syntax = this.syntax;
        for (let element of syntax) {
            if (name !== '*' && element.options.group !== name)
                continue;
            
            if (options?.skip && options.skip.includes(element.name))
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

    /**
     * Read this element from the given bitstream reader, applying the resulting values into this instance.
     * @param bitstream The reader to read from
     * @param variator A function which implements variation for this instance. The function should determine an 
     *                  appropriate variant instance and return it; from there on out the rest of the fields read will 
     *                  be applied to that instance instead of this instance.
     * @param options Options which modify how the element is read. Most notably this lets you skip specific fields
     */
    async read(bitstream : BitstreamReader, variator? : () => Promise<this>, options? : SerializeOptions) {
        await this.readGroup(bitstream, '*', variator, options);
    }

    /**
     * Read just the fields that are part of this specific subclass, ignoring the fields that are defined on superclasses.
     * This is used by BitstreamElement during variation, and is equivalent to readGroup(bitstream, '$*', variator, options)
     * @param bitstream The reader to read from
     * @param variator A function which implements variation for this instance. The function should determine an 
     *                  appropriate variant instance and return it; from there on out the rest of the fields read will 
     *                  be applied to that instance instead of this instance.
     * @param options Options which modify how the element is read. Most notably this lets you skip specific fields
     */
    async readOwn(bitstream : BitstreamReader, variator? : () => Promise<this>, options? : SerializeOptions) {
        await this.readGroup(bitstream, '$*', variator, options);
    }

    /**
     * Create a new instance of this BitstreamElement subclass by reading the necessary fields from the given 
     * BitstreamReader.
     * @param this 
     * @param bitstream The reader to read from
     * @param parent Specify a parent instance which the new instance is found within
     * @returns 
     */
    static async read<T extends BitstreamElement>(this : Constructor<T>, bitstream : BitstreamReader, parent? : BitstreamElement) : Promise<T> {
        return <any> await new StructureSerializer().read(bitstream, this, null, null);
    }

    /**
     * Deserialize an instance of this class from the given
     * data buffer. Will consider available variants, so the 
     * result could be a subclass.
     * @param data 
     * @returns 
     */
    static async deserialize<T>(this : Constructor<T>, data : Buffer | ArrayBuffer): Promise<T> {
        let reader = new BitstreamReader();
        reader.addBuffer(Buffer.from(data));
        return await (<any>this).read(reader);
    }

    /**
     * Write this instance to the given writer
     * @param bitstream The writer to write to
     * @param options Options which modify how the element is written. Most notably this lets you skip specific fields
     */
    write(bitstream : BitstreamWriter, options? : SerializeOptions) {
        this.writeGroup(bitstream, '*', options);
    }

    /**
     * Apply the given properties to this object and return ourself.
     * @param this 
     * @param changes The changes to apply
     */
    with<T>(this : T, changes : Partial<T>): T {
        Object.assign(this, changes);
        return this;
    }
}
