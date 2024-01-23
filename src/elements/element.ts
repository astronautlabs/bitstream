import { BitstreamMeasurer, BitstreamReader, BitstreamWriter } from "../bitstream";
import { BufferedWritable, Constructor, IncompleteReadResult } from "../common";
import { FieldDefinition } from "./field-definition";
import { VariantDefinition } from "./variant-definition";

const SERIALIZE_WRITERS = Symbol('Writers used by Bitstream#serialize() for this element type.');

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
export interface CommonOptions {
    /**
     * Set of fields to skip while writing
     */
    skip? : (string | symbol)[];
    context? : any;
}

/**
 * @deprecated
 */
export interface SerializeOptions extends CommonOptions {}

/**
 * These options are available on BitstreamElement#read*() operations (ie those which apply to an existing instance).
 */
export interface ReadOptions<T = BitstreamElement> extends CommonOptions {
    parent? : BitstreamElement;
    field? : FieldDefinition;
    variator? : () => Promise<T>;
}

/**
 * These options are available on BitstreamElement.read*() operations (ie those which are static)
 */
export interface StaticReadOptions<T = BitstreamElement> extends ReadOptions<T> {
    /**
     * When true, the operation will complete as soon as there are not enough bits. This is not intended 
     * to be used on data streamed in, but rather for situations where all the data for the entire read
     * operation is already available (such as BitstreamElement.deserialize()).
     * 
     * If you are reading from a buffer using BitstreamElement.read() directly, you might consider 
     * using deserialize() instead.
     */
    allowExhaustion? : boolean;
    elementBeingVariated? : BitstreamElement;
    params? : any[];

    /**
     * Provide a function which will be invoked passing the new instance being created.
     * Useful for customizing the setup of an object before it is otherwise parsed.
     * This is run after constructing the object but before parsing any fields.
     */
    initializer? : (instance: T) => void;
}

/**
 * These options are available when using Element.deserialize().
 */
export interface DeserializeOptions<T = BitstreamElement> extends StaticReadOptions<T> {
    /**
     * When true, the deserialize() operation will succeed even if there are not enough bits 
     * to satisfy the fields of the bitstream element. This is useful if there are optional trailing
     * fields where you are expected to stop reading (but continue without error) if there is no more 
     * data left.
     */
    allowExhaustion? : boolean;
}

/**
 * BitstreamElement is a base class which can be extended to produce "structures" that can be 
 * read from and written to a bitstream. It allows you to specify fields along with their type
 * and bitlength information declaratively, allowing BitstreamElement itself to handle the actual
 * serialization/deserialization in the context of a passed BitstreamReader/BitstreamWriter.
 */
export class BitstreamElement {
    /**
     * When serializing/deserializing a BitstreamElement, this contains an anonymous object that is shared by the 
     * top-level element and all sub-elements that are involved in the operation. The object is set to this property
     * at the earliest possible moment- for serialization this is just prior to the onSerializeStarted() event, 
     * for deserialization this is just after the instance is created.
     */
    context : any;

    /**
     * Number of total bits read from bitstream readers so far while parsing this element. 
     * Each read operation done via the read*() methods accumulates this counter. This can be 
     * a useful alternative to measure() when implementing "tail" buffers for extensible element 
     * types when there are multiple valid ways to encode data which has been read, 
     * ie the way you read it might not be the same as when you write it. 
     * 
     * The alternative (measure()) requires that the decoding and encoding of a specific bitstream element 
     * must be binary-compatible (ie that there is exactly one correct way to encode the data).
     */
    bitsRead : number;

    /**
     * The constructor parameters passed when constructing this element.
     * These must be saved for use during variation, should it be needed.
     * The values will be cleared out after parsing is completed.
     */
    savedConstructorParams: any[];

    // Lifecycle events

    /**
     * Called when this object is created as part of an element parsing operation.
     * - For unvariated elements this is called before parsing begins.
     * - For variated elements this is called before the original element's fields are copied into this instance.
     *   The instance being variated is passed as 'variatingFrom' in this case.
     * 
     * In either case, no fields have been populated within the instance before the lifecycle event is invoked.
     * To observe the values copied in when this object is the result of variation, see onVariationFrom().
     */
    onParseStarted(variatingFrom? : BitstreamElement) { }

    /**
     * Called when this object has completed parsing including all variation operations.
     * 
     * Note that onParseFinished() may not be invoked if the bitstream is exhausted before
     * parsing is finished or if this instance is replaced via variation. To observe this process, use 
     * onVariationTo/onVariationFrom. The final variation is the only one that has onParseFinished() invoked.
     */
    onParseFinished() { }

    /**
     * Called when this object is undergoing variation. The 'replacement' parameter contains the newly variated 
     * object. No further lifecycle events will occur for this instance, and all future lifecycle events occur on 
     * the replacement object.
     * 
     * @param replacement 
     */
    onVariationTo(replacement : BitstreamElement) { }

    /**
     * Called when this object is the result of a variation operation. The 'source' parameter contains the original
     * object. At this point all fields of the variation source have been copied into the new variant object.
     * @param source 
     */
    onVariationFrom(source : BitstreamElement) { }

    /**
     * Called when this object is about to be serialized to a BitstreamWriter.
     */
    onSerializeStarted() { }

    /**
     * Called when this object has been completely serialized to a BitstreamWriter.
     */
    onSerializeFinished() { }

    /**
     * Retrieve the "syntax" of this element, which is the list of fields defined on the element 
     * in order of appearance within the bitstream.
     */
    static get syntax() : FieldDefinition[] {
        let parentSyntax = (<FieldDefinition[]>(Object.getPrototypeOf(this).syntax || []));
        let syntax = parentSyntax.slice();
        let ownSyntax = this.ownSyntax;
        let insertIndex = syntax.findIndex(x => x.options.isVariantMarker);

        if (insertIndex >= 0)
            syntax.splice(insertIndex, 0, ...ownSyntax);
        else
            syntax.push(...ownSyntax);

        return syntax;
    }

    determineVariantType(parent? : BitstreamElement, variants? : (Function | VariantDefinition)[]) {
        let elementType : any = this.constructor;
        variants ??= elementType['variants'] || [];
        
        let variantDefns = variants.map((typeOrVariant : any) => 
            typeof typeOrVariant === 'function' 
                ? (<VariantDefinition>{ type: typeOrVariant, discriminant: typeOrVariant.variantDiscriminant })
                : typeOrVariant
        );

        variantDefns = variantDefns.sort((a, b) => {
            let aPriority = a.options.priority || 0;
            let bPriority = b.options.priority || 0;

            if (aPriority === 'first') aPriority = Number.MIN_SAFE_INTEGER;
            if (aPriority === 'last') aPriority = Number.MAX_SAFE_INTEGER;
            
            if (bPriority === 'first') bPriority = Number.MIN_SAFE_INTEGER;
            if (bPriority === 'last') bPriority = Number.MAX_SAFE_INTEGER;
            
            return aPriority - bPriority;
        });
        
        return variantDefns.find(v => v.discriminant(this, parent))?.type;
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
     * The size of the write buffer when using the serialize() method. This is set to 1KB by default, but may need to 
     * be tweaked for large objects.
     */
    serializeBufferSize = 1024;

    /**
     * Serialize all fields or a subset of fields into a buffer. 
     * @param fromRef The first field that should be serialized. If not specified, serialization begins at the start of
     *                  the element
     * @param toRef The last field that should be serialized. If not specified, serialization continues until the end of
     *                  the element 
     * @param autoPad When true and the bitsize of a field is not a multiple of 8, the final byte will 
     *                  contain zeros up to the next byte. When false (default), serialize() will throw
     *                  if the size is not a multiple of 8.
     */
    serialize(fromRef? : FieldRef<this>, toRef? : FieldRef<this>, autoPad = false) {
        if (this.syntax.length === 0)
            return;
        
        if (!fromRef)
            fromRef = this.syntax[0].name;

        if (!toRef) {
            if (this.getFieldBeingComputed()) {
                let toIndex = this.syntax.findIndex(f => f.name === this.getFieldBeingComputed().name);

                if (!this.getFieldBeingComputedIntrospectable())
                    toIndex -= 1;
                
                if (toIndex < 0)
                    return new Uint8Array(0);
                
                toRef = this.syntax[toIndex].name;
            } else if (this.isBeingRead) {
                let readFields = this.syntax.filter(x => this.readFields.includes(x.name)).map(x => x.name);
                toRef = readFields[readFields.length - 1];
            } else {
                toRef = this.syntax[this.syntax.length - 1].name;
            }
        }

        this.context = {};

        let from = this.selectField(fromRef);
        let to = this.selectField(toRef);
        let fromIndex = this.syntax.findIndex(x => x === from);
        let toIndex = this.syntax.findIndex(x => x === to);

        let stream = new BufferedWritable();

        // To reduce allocations during serialize(), we need to reuse writers.

        if (!this.constructor[SERIALIZE_WRITERS])
            this.constructor[SERIALIZE_WRITERS] = [];
        let writer: BitstreamWriter = this.constructor[SERIALIZE_WRITERS].pop() ?? new BitstreamWriter(stream, this.serializeBufferSize);
        writer.stream = stream;
        
        try {

            if (fromIndex > toIndex) {
                throw new Error(`Cannot measure from field ${fromIndex} (${String(from.name)}) to ${toIndex} (${String(to.name)}): First field comes after last field`);
            }

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
                    if (globalThis.BITSTREAM_TRACE !== false) {
                        console.error(`Failed to write field ${field.type.name}#${String(field.name)} using ${field.options.serializer.constructor.name}: ${e.message}`);
                        console.error(e);
                    }
                    throw new Error(`Failed to write field ${String(field.name)} using ${field.options.serializer.constructor.name}: ${e.message}`);
                }
            }

            if (writer.byteOffset !== 0 && !autoPad) {
                let length = writer.offset;
                throw new Error(`${length} bits (${Math.floor(length / 8)} bytes + ${length % 8} bits) is not an even amount of bytes!`);
            }

            writer.end();

            return stream.buffer;
        } finally {

            writer.reset();
            this.constructor[SERIALIZE_WRITERS].push(writer);
        }
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
                if (globalThis.BITSTREAM_TRACE === true) {
                    console.error(`Failed to measure field ${this.constructor.name}#${String(field.name)}:`);
                    console.error(e);
                }
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
    static get ownSyntax() : FieldDefinition[] {
        let obj : Object = this;
        if (!obj.hasOwnProperty('$ownSyntax')) {
            Object.defineProperty(obj, '$ownSyntax', {
                writable: true,
                value: [],
                enumerable: false
            });
        }

        return obj['$ownSyntax'];
    }

    static set ownSyntax(value) {
        this.ownSyntax.length; // causes property to be created
        this['$ownSyntax'] = value;
    }

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

    private isPresent(element : FieldDefinition, instance : this, reader?: BitstreamReader) {
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

        // Perform readahead checks. It is expected that the caller has already read the requisite number of bits 
        // ahead to allow the checks to occur.

        if (reader) {
            if (element.options.readAhead?.presentWhen) {
                if (!reader.simulateSync(() => element.options.readAhead.presentWhen(reader, instance)))
                    return false;
            }

            if (element.options.readAhead?.excludedWhen) {
                if (reader.simulateSync(() => element.options.readAhead.excludedWhen(reader, instance)))
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
     * @returns A generator. When the read is complete (done=true), the result will be the current instance, 
     *              unless the instance was variated into a subclass, in which case it will be the 
     *              variated subclass instance. Because this process can occur, it is important to observe the result 
     *              of this function. If the read buffer becomes exhausted, an IncompleteReadResult will be returned.
     */
    protected *readGroup(
        bitstream : BitstreamReader, 
        name : string, 
        options? : ReadOptions<this>
    ): Generator<IncompleteReadResult, this> {
        let wasBeingRead = this.isBeingRead;
        let instance = this;

        instance.isBeingRead = true;

        try {
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

            for (let element of syntax) {

                // Preconditions 

                if (element.options.readAhead) {
                    let length = 0;
                    
                    if (typeof element.options.readAhead.length === 'number') {
                        length = element.options.readAhead.length;
                    } else if (typeof element.options.readAhead.length === 'function') {
                        length = element.options.readAhead.length(instance, element);
                    }

                    if (bitstream.available < length) {
                        yield {
                            remaining: length - bitstream.available,
                            contextHint: () => `[readAhead ${length} bits]`,
                            optional: true
                        }
                    }
                }

                if (!this.isPresent(element, instance, bitstream))
                    continue;
                    
                if (options?.skip && options.skip.includes(element.name))
                    continue;

                // If this is a @VariantMarker(), perform marker variation.
                // This is one of two ways variation can occur- the other being 
                // "tail variation" which happens after all fields of this type are parsed
                // and none of them are marked with @VariantMarker().

                if (element.options.isVariantMarker) {
                    if (globalThis.BITSTREAM_TRACE)
                        console.log(`Variating at marker...`);
                    
                    let g = this.variate(bitstream, options.parent, options.field);
                    while (true) {
                        let result = g.next();
                        if (result.done === false) {
                            let incompleteResult = result.value;
                            yield { 
                                remaining: incompleteResult.remaining,
                                contextHint: () => this.summarizeElementField(element, incompleteResult.contextHint()),
                                optional: incompleteResult.optional
                            };
                        } else {
                            instance = result.value;
                            break;
                        }
                    }
                    
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
                    let startOffset = bitstream.offset;
                    let g = element.options.serializer.read(bitstream, element.type, instance, element);
                    let readValue;
                    while (true) {
                        let result = g.next();
                        if (result.done === false) {
                            let incompleteResult = result.value;
                            yield { 
                                remaining: incompleteResult.remaining, 
                                contextHint: () => this.summarizeElementField(element, incompleteResult.contextHint()),
                                optional: incompleteResult.optional,
                            };
                        } else {
                            readValue = result.value;
                            break;
                        }
                    }

                    if (!element.options.isIgnored)
                        instance[element.name] = readValue;
                    instance.readFields.push(element.name);
                    instance.bitsRead += (bitstream.offset - startOffset);

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
                                `   ${this.rightPad(`${element.containingType.name}#${String(element.name)}`, 50)} <= ${displayedValue}`
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
        } finally {
            this.isBeingRead = wasBeingRead;
        }

        return instance;
    }

    /**
     * Write a group of fields to the given bitstream writer. This is used by BitstreamElement internally, but it can 
     * be called directly when overriding the default write behavior in a subclass, if desired. 
     * @param bitstream The bitstream writer to write the fields to
     * @param name The name of the group to write. 
     * @param options Options that modify how the group is written. Most notably this allows you to skip specific 
     *                  fields.
     */
    protected writeGroup(bitstream : BitstreamWriter, name : string, options? : CommonOptions) {
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

            if (globalThis.BITSTREAM_TRACE === true && !(bitstream instanceof BitstreamMeasurer)) {
                let displayedValue = `${writtenValue}`;

                if (typeof writtenValue === 'number') {
                    displayedValue = `0x${writtenValue.toString(16)} [${writtenValue}]`;
                }

                try {
                    console.log(
                        `[ + ${
                            this.leftPad(this.measureField(element.name), 4)
                            } bit(s) = ${
                                this.leftPad(Math.floor(this.measureTo(element.name) / 8), 4)
                            } byte(s), ${
                                this.leftPad(
                                    this.measureTo(element.name)
                                    - Math.floor(this.measureTo(element.name) / 8)*8
                                , 4)
                            } bits = ${this.leftPad(this.measureTo(element.name), 4)} bits total] `
                        + 
                        `   ${this.rightPad(`${element.containingType.name}#${String(element.name)}`, 50)} => ${displayedValue}`
                    );
                } catch (e) {
                    console.log(`Error while tracing write operation for element ${String(element.name)}: ${e.message}`);
                    console.error(e);
                }
            }

            try {
                element.options.serializer.write(bitstream, element.type, this, element, writtenValue);
            } catch (e) {
                if (globalThis.BITSTREAM_TRACE !== false) {
                    console.error(`Failed to write field ${element.type.name}#${String(element.name)} using ${element.options.serializer.constructor.name}: ${e.message}`);
                    console.error(e);
                }
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
     * @returns The current instance, unless it was variated into a subclass instance, in which case it will be the 
     *                  variated subclass instance. Thus it is important to observe the result of this method.
     */
    *read(bitstream : BitstreamReader, options? : CommonOptions) {
        let g = this.readGroup(bitstream, '*', options);
        while (true) {
            let result = g.next();
            if (result.done === false) {
                let incompleteResult = result.value;
                yield <IncompleteReadResult>{ 
                    remaining: incompleteResult.remaining, 
                    contextHint: () => this.summarizeElementOperation(`read()`, incompleteResult.contextHint()),
                    optional: incompleteResult.optional,
                };
            } else {
                return result.value;
            }
        }
    }

    /**
     * Read just the fields that are part of this specific subclass, ignoring the fields that are defined on superclasses.
     * This is used by BitstreamElement during variation, and is equivalent to readGroup(bitstream, '$*', variator, options)
     * @param bitstream The reader to read from
     * @param variator A function which implements variation for this instance. The function should determine an 
     *                  appropriate variant instance and return it; from there on out the rest of the fields read will 
     *                  be applied to that instance instead of this instance.
     * @param options Options which modify how the element is read. Most notably this lets you skip specific fields
     * @returns A generator which will yield only one result. If the generator completes (done=true), then the result 
     *          will be `this` the current instance, unless it was variated into a subclass instance, in which case 
     *          it will be the variated subclass instance. Thus it is important to observe the result of this method.
     *          If the read buffer becomes exhausted, the result will be an IncompleteReadResult.
     */
    *readOwn(bitstream : BitstreamReader, options? : CommonOptions) {
        let g = this.readGroup(bitstream, '$*', options);
        while (true) {
            let result = g.next();
            if (result.done === false) {
                let incompleteResult = result.value;
                yield { 
                    remaining: incompleteResult.remaining, 
                    contextHint: () => this.summarizeElementOperation(`readOwn()`, incompleteResult.contextHint()),
                    optional: incompleteResult.optional
                };
            } else {
                return result.value;
            }
        }
    }

    /**
     * Apply variation rules to this element. If one is found, the new variated instance is returned, otherwise 
     * the current instance is returned.
     * 
     * @param reader The reader to read from
     * @param parent The parent element of this element
     * @param field The Bitstream field that this element is being parsed for when this is a subelement of a larger 
     *     parse operation.
     * @returns 
     */
    *variate(reader : BitstreamReader, parent? : BitstreamElement, field? : FieldDefinition): Generator<IncompleteReadResult, this> {
        let variantType : typeof BitstreamElement = this.determineVariantType(parent, field?.options.variants);
        if (variantType) {
            if (globalThis.BITSTREAM_TRACE)
                console.log(`Selected variant ${variantType.name}`);
            let g = variantType.read(reader, { 
                parent, field, 
                elementBeingVariated: this, 
                context: this.context
            });
            do {
                let result = g.next();
                if (result.done === false) {
                    let incompleteResult = result.value;
                    yield { 
                        remaining: incompleteResult.remaining, 
                        contextHint: () => this.summarizeElementOperation(`variate()`, incompleteResult.contextHint()),
                        optional: incompleteResult.optional
                    };
                } else {
                    return <this> result.value;
                }
            } while (true);
        }

        return this;
    }

    /**
     * Create a new instance of this BitstreamElement subclass by reading the necessary fields from the given 
     * BitstreamReader.
     * @param this 
     * @param reader The reader to read from
     * @param parent Specify a parent instance which the new instance is found within
     * @returns 
     */
    static async readBlocking<T extends typeof BitstreamElement>(
        this : T, 
        reader : BitstreamReader, 
        options : StaticReadOptions = {}
    ) : Promise<InstanceType<T>> {
        let iterator = <Generator<IncompleteReadResult, InstanceType<T>>> this.read(reader, options);
        do {
            let result = iterator.next();
            if (result.done === false) {
                await reader.assure(result.value.remaining, result.value.optional);
                continue;
            }
    
            return result.value;
        } while (true);
    }

    /**
     * Deserialize an instance of this class from the given
     * data buffer. Will consider available variants, so the 
     * result could be a subclass.
     * @param data 
     * @returns 
     */
    static deserialize<T extends typeof BitstreamElement>(
        this : T, 
        data : Uint8Array, 
        options : DeserializeOptions = {}
    ): InstanceType<T> {
        let reader = new BitstreamReader();
        reader.addBuffer(data);
        let gen = this.read(reader, options);
        while (true) {
            let result = gen.next();
            if (result.done === false) {
                throw new Error(
                    `Buffer exhausted while reading ${result.value.remaining} bits ` 
                    + `at offset ${reader.offset}, ` 
                    + `context:\n     - ${result.value.contextHint().replace(/\n/g, "\n     - ")}\n\n`);
            } else {
                return result.value;
            }
        }
    }

    /**
     * Write this instance to the given writer
     * @param bitstream The writer to write to
     * @param options Options which modify how the element is written. Most notably this lets you skip specific fields
     */
    write(bitstream : BitstreamWriter, options? : CommonOptions) {
        this.context = options?.context ?? {};
        this.onSerializeStarted();
        this.writeGroup(bitstream, '*', options);
        this.onSerializeFinished();
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

    /**
     * Perform a synchronous read operation on the given reader with the given generator. If there are not enough bits available
     * to complete the operation, this method will throw an exception.
     * 
     * @param reader 
     * @param generator 
     * @returns 
     */
    static readSync<T extends typeof BitstreamElement>(this : T, reader : BitstreamReader, options : StaticReadOptions = {}): InstanceType<T> {
        let iterator = <Generator<IncompleteReadResult, InstanceType<T>>> this.read(reader, options);
        do {
            let result = iterator.next();
            if (result.done === false) {
                if (reader.ended && result.value.optional)
                    continue;
                throw new Error(`Not enough bits: Reached end of buffer while trying to read ${result.value.remaining} bits! Context: ${result.value.contextHint()}`);
            }
    
            return result.value;
        } while (true);
    }

    /**
     * Try to read the bitstream using the given generator function synchronously, if there are not enough bits, abort 
     * and return undefined.
     * @param reader The reader to read from
     * @returns The result of the read operation if successful, or undefined if there was not enough bits to complete the operation.
     */
    static tryRead<T extends typeof BitstreamElement>(this : T, reader : BitstreamReader, options : StaticReadOptions = {}): InstanceType<T> {
        let previouslyRetaining = reader.retainBuffers;
        let startOffset = reader.offset;

        reader.retainBuffers = true;

        try {

            let iterator = this.read(reader, options);
            let result = iterator.next();
            if (result.done === false) {
                // we need more bits, fail
                reader.offset = startOffset;
                return undefined;
            }

            return result.value;
        } catch (e) {
            reader.offset = startOffset;
            throw e;
        } finally {
            reader.retainBuffers = previouslyRetaining;
        }
    }

    /**
     * Try to read the bitstream using the given generator function synchronously, if there are not enough bits, abort 
     * and return undefined.
     * @param reader The reader to read from
     * @returns A generator which when called will result in exactly one result. The result will either be a number
     *      (in which case 'done' is false) indicating that more bits were required to complete the read operation but 
     *      they were unavailable on the given stream. Otherwise it will be an instance of the expected element type (in which
     *      case 'done' is true). The stream will be left in the state where the partial data was read. If you want to 
     *      undo the read of the partial data, you will need to use retainBuffers = true, take note of the reader's offset
     *      before the operation, and set the offset of the reader back to that value after the failed read. Note that 
     *      retainBuffers requires you to manage the saved buffers manually (see BitstreamReader.clean()).
     */
    static *read<T extends typeof BitstreamElement>(
        this : T, 
        reader : BitstreamReader,
        options : StaticReadOptions = {}
    ) {
        options.context ??= {};
        let constructorParams = options.params 
            ?? options.elementBeingVariated?.savedConstructorParams 
            ?? []
        ;

        let element : BitstreamElement = new (this as any)(...constructorParams);

        if (options.initializer) {
            options.initializer(element);
        }

        if (options.field?.options?.initializer) {
            options.field.options.initializer(element, options.parent);
        }

        element.savedConstructorParams = constructorParams;

        let allowExhaustion = options.allowExhaustion ?? false;
        element.context = options.context;
        element.onParseStarted(options.elementBeingVariated);

        element.parent = options.parent;
        let parentStillReading = options.elementBeingVariated?.isBeingRead ?? false;
        element.isBeingRead = true;
        element.bitsRead = 0;

        if (options.elementBeingVariated) {
            element.bitsRead = options.elementBeingVariated.bitsRead;
            element.syntax.forEach(f => {
                if (options.field?.options?.skip && options.field.options.skip.includes(f.name))
                    return;

                if (options.skip && options.skip.includes(f.name))
                    return;

                if (options.elementBeingVariated.syntax.some(x => x.name === f.name) && options.elementBeingVariated.readFields.includes(f.name)) {
                    if (!f.options.isIgnored)
                        element[f.name] = options.elementBeingVariated[f.name];
                    element.readFields.push(f.name);
                }
            });

            options.elementBeingVariated.onVariationTo(element);
            element.onVariationFrom(options.elementBeingVariated);

            let g = element.readOwn(reader, { skip: options.field?.options?.skip });
            while (true) {
                let result = g.next();
                if (result.done === false) {
                    if (allowExhaustion)
                        return <InstanceType<T>> element;
                    let incompleteResult = result.value;

                    yield { 
                        remaining: incompleteResult.remaining, 
                        contextHint: () => element.summarizeElementOperation(`${this.name}.readVariant()`, incompleteResult.contextHint()),
                        optional: incompleteResult.optional
                    };
                } else {
                    element = result.value;
                    break;
                }
            }
        } else {
            let g = element.read(reader, { skip: [...(options.skip ?? []), ...(options.field?.options?.skip ?? [])] });
            while (true) {
                let result = g.next();
                if (result.done === false) {
                    if (allowExhaustion)
                        return <InstanceType<T>> element;

                    let incompleteResult = result.value;
                    yield { 
                        remaining: incompleteResult.remaining, 
                        contextHint: () => element.summarizeElementOperation(`${this.name}.read()`, incompleteResult.contextHint()),
                        optional: incompleteResult.optional
                    };
                } else {
                    element = result.value;
                    break;
                }
            }
        }

        element.isBeingRead = parentStillReading;

        // Perform tail variation: Only used when there is no @VariantMarker() within the element.
        // For marker variation, see readGroup()'s use of variate()
        if (!element.ownSyntax.some(x => x.options.isVariantMarker)) {
            let g = element.variate(reader, options.parent, options.field);
            while (true) {
                let result = g.next();
                if (result.done === false) {
                    if (allowExhaustion)
                        return <InstanceType<T>> element;

                    let incompleteResult = result.value;
                    yield { 
                        remaining: incompleteResult.remaining, 
                        contextHint: () => element.summarizeElementOperation(`tail-variation`, incompleteResult.contextHint()),
                        optional: incompleteResult.optional
                    };
                } else {
                    element = result.value;
                    break;
                }
            }
        }
        
        delete element.savedConstructorParams;
        if (!options?.elementBeingVariated)
            element.onParseFinished();
        return <InstanceType<T>> element;
    }

    
    protected summarizeElementField(field: FieldDefinition, innerContext: string) {
        return `${innerContext}\n[readField()] ${this.constructor.name}#${String(field.name)}`;
    }

    protected summarizeElementOperation(operation: string, innerContext: string) {
        return `${innerContext}\n[${operation}] ${this.constructor.name}`;
    }
}
