import { BitstreamElement } from "./element";
import { FieldOptions } from "./field-options";
import { BitstreamReader } from "./reader";
import { Serializer } from "./serializer";
import { FieldDefinition } from "./syntax-element";
import { VariantDefinition } from "./variant";
import { BitstreamWriter } from "./writer";

export function resolveLength(determinant : LengthDeterminant, parent : BitstreamElement, field : FieldDefinition) {
    if (typeof determinant === 'number')
        return determinant;

    if (!parent)
        throw new Error(`Cannot resolve length without an instance!`);
    
    let length = parent.runWithFieldBeingComputed(field, () => determinant(parent, field));

    if (typeof length !== 'number')
        throw new Error(`${field.containingType.name}#${String(field.name)}: Length determinant returned non-number value: ${length}`);

    if (length < 0) {
        let message = `${field.containingType.name}#${String(field.name)}: Length determinant returned negative value ${length} -- Value read so far: ${JSON.stringify(parent, undefined, 2)}`;

        console.error(message);
        console.error(`============= Item =============`);
        console.dir(parent);
        let debugParent = parent.parent;
        while (debugParent) {
            console.error(`============= Parent =============`);
            console.dir(debugParent);
            debugParent = debugParent.parent;
        }

        throw new Error(message);
    }

    return length;
}

export class NumberSerializer implements Serializer {
    async read(reader: BitstreamReader, type : any, parent : BitstreamElement, field: FieldDefinition) {
        let length : number;
        try {
            length = resolveLength(field.length, parent, field);
        } catch (e) {
            throw new Error(`Failed to resolve length of number via 'length' determinant: ${e.message}`);
        }

        return await reader.read(length);
    }

    write(writer: BitstreamWriter, type : any, instance: any, field: FieldDefinition, value: any) {
        if (value === undefined)
            value = 0;

        let length : number;
        try {
            length = resolveLength(field.length, instance, field);
        } catch (e) {
            throw new Error(`Failed to resolve length of number via 'length' determinant: ${e.message}`);
        }

        writer.write(length, value);
    }
}

export class NullSerializer implements Serializer {
    async read(reader: BitstreamReader, type : any, parent : BitstreamElement, field: FieldDefinition) {
    }

    write(writer: BitstreamWriter, type : any, instance: any, field: FieldDefinition, value: any) {
    }
}

export class BooleanSerializer implements Serializer {
    async read(reader: BitstreamReader, type : any, parent : BitstreamElement, field: FieldDefinition) {
        return await reader.read(resolveLength(field.length, parent, field)) !== 0;
    }

    write(writer: BitstreamWriter, type : any, instance: any, field: FieldDefinition, value: any) {
        writer.write(resolveLength(field.length, instance, field), value ? 1 : 0);
    }
}

export class ArraySerializer implements Serializer {
    async read(reader: BitstreamReader, type : any, parent : BitstreamElement, field: FieldDefinition) {
        let count = 0;
        let elements = [];

        if (field.options.array.countFieldLength) {
            count = await reader.read(field.options.array.countFieldLength);
        } else if (field.options.array.count) {
            count = resolveLength(field.options.array.count, parent, field);
        }

        if (parent) {
            parent.readFields.push(field.name);
            parent[field.name] = [];
        }

        if (field.options.array.type === Number) {
            // Array of numbers. Useful when the array holds a single number field, but the 
            // bit length of the element fields is not 8 (where you would probably use a single `Buffer` field instead).
            // For instance, in somes IETF RFCs 10 bit words are used instead of 8 bit words (ie bytes).

            if (field.options.array.hasMore) {
                    do {
                        let continued : boolean;
                        
                        try {
                            parent.runWithFieldBeingComputed(field, () => 
                                continued = field.options.array.hasMore(parent, parent.parent), true);
                        } catch (e) {
                            throw new Error(`${parent?.constructor.name || '<none>'}#${String(field?.name || '<none>')} Failed to determine if array has more items via 'hasMore' discriminant: ${e.message}`);
                        }

                        if (!continued)
                            break;

                        let elementLength = field.options.array.elementLength;
                        elements.push(await reader.read(elementLength));
                    } while (true);
            } else {
                for (let i = 0; i < count; ++i) {
                    let elementLength = field.options.array.elementLength;
                    elements.push(await reader.read(elementLength));
                }
            }
        } else {
            //console.log(`Reading array of ${field.options.array.type.name}, size ${count}`);
            if (field.options.array.hasMore) {
                let i = 0;
                do {
                    let continued : boolean;
                    
                    try {
                        parent.runWithFieldBeingComputed(field, () => 
                            continued = field.options.array.hasMore(parent, parent.parent), true);
                    } catch (e) {
                        throw new Error(`${parent?.constructor.name || '<none>'}#${String(field?.name || '<none>')} Failed to determine if array has more items via 'hasMore' discriminant: ${e.message}`);
                    }

                    if (!continued)
                        break;

                    let element : BitstreamElement;
                    let serializer = new StructureSerializer();

                    //console.log(`Reading index ${i++} of array...`);
                    element = await serializer.read(reader, field.options.array.type, parent, field);
                    elements.push(element);
                    parent[field.name].push(element);

                } while (true);
            } else {
                for (let i = 0; i < count; ++i) {
                    let element : BitstreamElement;
                    let serializer = new StructureSerializer();

                    //console.log(`Reading index ${i} of array...`);
                    element = await serializer.read(reader, field.options.array.type, parent, field);
                    elements.push(element);
                    parent[field.name].push(element);
                }
            }
        }

        return elements;
    }
    
    write(writer : BitstreamWriter, type : any, parent : BitstreamElement, field : FieldDefinition, value : any[]) {
        if (!value) {
            throw new Error(`${parent?.constructor.name || '<none>'}#${String(field?.name) || '<none>'}: Cannot serialize a null array!`);
        }

        let length = value.length;

        if (field.options.array.countFieldLength) {
            let countFieldLength = field.options.array.countFieldLength;

            if (length >= Math.pow(2, countFieldLength)) {
                length = Math.pow(2, countFieldLength) - 1;
            }

            writer.write(field.options.array.countFieldLength, value.length);
        } else if (field.options.array.count) {
            try {
                length = resolveLength(field.options.array.count, parent, field);
            } catch (e) {
                throw new Error(`Failed to resolve length for array via 'count': ${e.message}`);
            }

            if (length > value.length) {
                throw new Error(
                    `${field.containingType.name}#${String(field.name)}: ` 
                    + `Array field's count determinant specified ${length} elements should be written ` 
                    + `but array only contains ${value.length} elements. `
                    + `Ensure that the value of the count determinant is compatible with the number of elements in ` 
                    + `the provided array.`
                );
            }
        }

        for (let i = 0; i < length; ++i) {
            if (field.options.array.type === Number) { 
                writer.write(field.options.array.elementLength, value[i]);
            } else {
                value[i].write(writer);
            }
        }
    }
}

export class BufferSerializer implements Serializer {
    async read(reader: BitstreamReader, type : any, parent : BitstreamElement, field: FieldDefinition) {
        let length : number;
        
        try {
            length = resolveLength(field.length, parent, field) / 8;
        } catch (e) {
            throw new Error(`Failed to resolve length for buffer via 'length': ${e.message}`);
        }
        
        let buffer = Buffer.alloc(length);
        for (let i = 0, max = buffer.length; i < max; ++i)
            buffer[i] = await reader.read(8);
        return buffer;
    }

    write(writer: BitstreamWriter, type : any, parent : BitstreamElement, field: FieldDefinition, value: Buffer) {
        let length : number;

        try {
            length = resolveLength(field.length, parent, field) / 8
        } catch (e) {
            throw new Error(`Failed to resolve length for buffer via 'length': ${e.message}`);
        }

        let fieldLength = Math.floor(length);

        if (field.options?.buffer?.truncate === false) {
            writer.writeBuffer(value);
        } else {
            if (value.length > fieldLength) {
                writer.writeBuffer(value.subarray(0, resolveLength(field.length, parent, field)));
            } else {
                writer.writeBuffer(value);
                if (value.length < fieldLength)
                    writer.writeBuffer(Buffer.alloc(fieldLength - value.length, 0));
            }
        }
    }
}

export class StringSerializer implements Serializer {
    async read(reader: BitstreamReader, type : any, parent : BitstreamElement, field: FieldDefinition) {
        return await reader.readString(resolveLength(field.length, parent, field), field.options.string);
    }

    write(writer : BitstreamWriter, type : any, parent : BitstreamElement, field : FieldDefinition, value : any) {
        let length : number;
        try {
            length = resolveLength(field.length, parent, field);
        } catch (e) {
            throw new Error(`Failed to resolve length of string via 'length' determinant: ${e.message}`);
        }

        writer.writeString(length, `${value}`, field?.options?.string?.encoding || 'utf-8');
    }
}

export class StructureSerializer implements Serializer {
    async read(reader: BitstreamReader, type : any, parent: BitstreamElement, defn : FieldDefinition, baseElement? : BitstreamElement) {
        let element : BitstreamElement = new type();
        element.parent = parent;

        let parentStillReading = baseElement ? baseElement.isBeingRead : false;
        element.isBeingRead = true;

        let variator = async () => {
            let elementType : any = element.constructor;
            let variants : VariantDefinition[] = elementType.variants;
            
            if (defn && defn.options.variants) {
                variants = defn.options.variants.map((typeOrVariant : any) => 
                    typeof typeOrVariant === 'function' 
                        ? (<VariantDefinition>{ type, discriminant: type.variantDiscriminant })
                        : typeOrVariant
                );
            }

            variants = variants.sort((a, b) => {
                let aPriority = a.options.priority || 0;
                let bPriority = b.options.priority || 0;

                if (aPriority === 'first') aPriority = Number.MIN_SAFE_INTEGER;
                if (aPriority === 'last') aPriority = Number.MAX_SAFE_INTEGER;
                
                if (bPriority === 'first') bPriority = Number.MIN_SAFE_INTEGER;
                if (bPriority === 'last') bPriority = Number.MAX_SAFE_INTEGER;
                
                return aPriority - bPriority;
            });

            if (variants) {
                let match = variants.find(v => v.discriminant(element, parent));
                if (match) {
                    //console.log(`[::] ${element.constructor.name} into ${match.type.name}`);
                    return element = await this.read(reader, match.type, parent, defn, element);
                }
            }

            //console.log(`No matching variants found out of ${variants.length} options.`);
            return element;
        };

        if (baseElement) {
            //console.log(`Copying pre-parsed values into ${element.constructor.name} from ${baseElement.constructor.name}...`);
            element.syntax.forEach(f => {
                if (defn.options?.skip && defn.options.skip.includes(f.name))
                    return;

                if (baseElement.syntax.some(x => x.name === f.name) && baseElement.readFields.includes(f.name)) {
                    if (!f.options.isIgnored)
                        element[f.name] = baseElement[f.name];
                    element.readFields.push(f.name);
                }
            });

            //console.log(`Reading own values of ${element.constructor.name}`);
            await element.readOwn(reader, variator, { skip: defn?.options?.skip });
        } else {
            //console.log(`Reading values of ${element.constructor.name}`);
            await element.read(reader, variator, { skip: defn?.options?.skip });
        }

        if (globalThis.BITSTREAM_TRACE)
            console.log(`Done reading ${element.constructor.name}, isBeingRead=${parentStillReading}`);
        element.isBeingRead = parentStillReading;

        if (!element.ownSyntax.some(x => x.options.isVariantMarker)) {
            if (globalThis.BITSTREAM_TRACE)
                console.log(`** Variating ${element.constructor.name}`);
            element = await variator();
        }
        
        return element;
    }

    async write(writer: BitstreamWriter, type : any, instance: any, field: FieldDefinition, value: BitstreamElement) {
        if (!value) {
            throw new Error(`Cannot write ${field.type.name}#${String(field.name)}: Value is null/undefined`);
        }
        await value.write(writer, { skip: field.options?.skip });
    }
}

export type LengthDeterminant = number | ((instance : any, f : FieldDefinition) => number);
export type ValueDeterminant<T = any> = T | ((instance : any, f : FieldDefinition) => T);

/**
 * Mark a property of a BitstreamElement subclass as a field that should be read from the bitstream.
 * @param length The length of the field, in bits (except when the field has type Buffer or String, in which case it is in bytes)
 * @param options 
 */
export function Field(length? : LengthDeterminant, options? : FieldOptions) {
    if (!options)
        options = {};
    
    return (target : any, fieldName : string | symbol) => {
        let containingType = target.constructor;

        if (!(containingType as Object).hasOwnProperty('ownSyntax')) {
            containingType.ownSyntax = [];
        }

        let field : FieldDefinition = { 
            name: fieldName, 
            containingType,
            type: Reflect.getMetadata('design:type', target, fieldName),
            length, 
            options 
        }

        if (field.type === Buffer && typeof field.length === 'number' && field.length % 8 !== 0)
            throw new Error(`${containingType.name}#${String(field.name)}: Length (${field.length}) must be a multiple of 8 when field type is Buffer`);

        if (field.type === Array) {
            if (!field.options.array?.type)
                throw new Error(`${containingType.name}#${String(field.name)}: Array field must specify option array.type`);
            if (!(field.options.array?.type.prototype instanceof BitstreamElement) && field.options.array?.type !== Number)
                throw new Error(`${containingType.name}#${String(field.name)}: Array fields can only be used with types which inherit from BitstreamElement`);
            if (field.options.array?.countFieldLength) {
                if (typeof field.options.array.countFieldLength !== 'number' || field.options.array.countFieldLength <= 0)
                    throw new Error(`${containingType.name}#${String(field.name)}: Invalid value provided for length of count field: ${field.options.array.countFieldLength}. Must be a positive number.`);
            }

            if (field.options.array?.count) {
                if (typeof field.options.array.count !== 'number' && typeof field.options.array.count !== 'function')
                    throw new Error(`${containingType.name}#${String(field.name)}: Invalid value provided for count determinant: ${field.options.array.count}. Must be a number or function`);
            }
        }

        if (!options.serializer) {
            if (field.type === Array)
                options.serializer = new ArraySerializer();
            else if (field.type?.prototype instanceof BitstreamElement)
                options.serializer = new StructureSerializer();
            else if (field.length === 0)
                options.serializer = new NullSerializer();
            else if (field.type === Object)
                options.serializer = new NumberSerializer();
            else if (field.type === Number)
                options.serializer = new NumberSerializer();
            else if (field.type === Boolean)
                options.serializer = new BooleanSerializer();
            else if (field.type === Buffer)
                options.serializer = new BufferSerializer();
            else if (field.type === String)
                options.serializer = new StringSerializer();
            else
                throw new Error(`${containingType.name}#${String(field.name)}: No serializer available for type ${field.type?.name || '<unknown>'}`);
        }

        (<FieldDefinition[]>containingType.ownSyntax).push(field);
    }
}

/**
 * Used to mark a specific field as reserved. The value in this field will be read, but will not be 
 * copied into the BitsreamElement, and when writing the value will always be all high bits.
 * @param length 
 * @param options 
 */
export function Reserved(length : LengthDeterminant, options? : FieldOptions) {
    if (!options)
        options = {};

    options.isIgnored = true;
    options.writtenValue = (instance, field : FieldDefinition) => {
        if (field.type === Number) {
            let currentLength = resolveLength(field.length, instance, field);
            return Math.pow(2, currentLength) - 1;
        }
    };

    let decorator = Field(length, options);
    return (target : any, fieldName : string | symbol) => {
        fieldName = Symbol(`[reserved: ${typeof length === 'number' ? `${length} bits` : `dynamic`}]`);
        Reflect.defineMetadata('design:type', Number, target, fieldName);
        return decorator(target, fieldName);
    }
}

/**
 * Used to mark a location within a BitstreamElement which can be used with measure()
 */
export function Marker() {
    return Field(0, { isIgnored: true });
}