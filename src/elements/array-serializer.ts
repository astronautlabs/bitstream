import { BitstreamReader, BitstreamWriter } from "../bitstream";
import { BitstreamElement } from "./element";
import { resolveLength } from "./resolve-length";
import { Serializer } from "./serializer";
import { StructureSerializer } from "./structure-serializer";
import { FieldDefinition } from "./field-definition";
import { IncompleteReadResult } from "../common";
import { summarizeField } from "./utils";

/**
 * Serializes arrays to/from bitstreams
 */
export class ArraySerializer implements Serializer {
    *read(reader: BitstreamReader, type : any, parent : BitstreamElement, field: FieldDefinition): Generator<IncompleteReadResult, any> {
        let count = 0;
        let elements = [];

        if (field?.options?.array?.countFieldLength) {
            if (!reader.isAvailable(field.options.array.countFieldLength))
                yield { remaining: field.options.array.countFieldLength, contextHint: () => summarizeField(field) };
            count = reader.readSync(field.options.array.countFieldLength);
        } else if (field?.options?.array?.count) {
            count = resolveLength(field.options.array.count, parent, field);
        } else if (field?.length) {
            count = resolveLength(field?.length, parent, field);
        }

        if (parent) {
            parent.readFields.push(field.name);
            parent[field.name] = [];
        }

        if (field?.options?.array?.type === Number) {
            // Array of numbers. Useful when the array holds a single number field, but the 
            // bit length of the element fields is not 8 (where you would probably use a single `Buffer` field instead).
            // For instance, in somes IETF RFCs 10 bit words are used instead of 8 bit words (ie bytes).
            let elementLength = field.options.array.elementLength;
            let format = field?.options?.number?.format ?? 'unsigned';
            let readNumber = () => {
                if (format === 'signed')
                    elements.push(reader.readSignedSync(elementLength));
                else if (format === 'float')
                    elements.push(reader.readFloatSync(elementLength));
                else if (format === 'unsigned')
                    elements.push(reader.readSync(elementLength));
                else
                    throw new Error(`Unsupported number format '${format}'`);
            };

            if (field?.options?.array?.hasMore) {
                    do {
                        let continued : boolean;
                        
                        try {
                            parent.runWithFieldBeingComputed(field, () => 
                                continued = field.options.array.hasMore(elements, parent, parent.parent), true);
                        } catch (e) {
                            throw new Error(`${parent?.constructor.name || '<none>'}#${String(field?.name || '<none>')} Failed to determine if array has more items via 'hasMore' discriminant: ${e.message}`);
                        }

                        if (!continued)
                            break;


                        if (!reader.isAvailable(elementLength))
                            yield { remaining: elementLength, contextHint: () => summarizeField(field) };
                        
                        readNumber();
                    } while (true);
            } else {
                for (let i = 0; i < count; ++i) {
                    if (!reader.isAvailable(elementLength))
                        yield { remaining: elementLength, contextHint: () => summarizeField(field) };
                    
                    readNumber();
                }
            }
        } else {
            if (field.options.array.hasMore) {
                let i = 0;
                do {
                    let continued : boolean;
                    
                    try {
                        parent.runWithFieldBeingComputed(field, () => 
                            continued = field.options.array.hasMore(elements, parent, parent.parent), true);
                    } catch (e) {
                        throw new Error(`${parent?.constructor.name || '<none>'}#${String(field?.name || '<none>')} Failed to determine if array has more items via 'hasMore' discriminant: ${e.message}`);
                    }

                    if (!continued)
                        break;

                    let element : BitstreamElement;
                    let serializer = new StructureSerializer();
                    let gen = serializer.read(reader, <typeof BitstreamElement> field.options.array.type, parent, field);
                    
                    while (true) {
                        let result = gen.next();
                        if (result.done === false) {
                            yield result.value;
                        } else {
                            element = result.value;
                            break;
                        }
                    }

                    elements.push(element);
                    parent[field.name].push(element);

                } while (true);
            } else {
                for (let i = 0; i < count; ++i) {
                    let element : BitstreamElement;
                    let serializer = new StructureSerializer();
                    let g = serializer.read(reader, <typeof BitstreamElement> field.options.array.type, parent, field);

                    while (true) {
                        let result = g.next();
                        if (result.done === false) {
                            yield result.value;
                        } else {
                            element = result.value;
                            break;
                        }
                    }

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
            if (field?.options?.array?.type === Number) { 
                let type = field.options?.number?.format ?? 'unsigned';

                if (type === 'unsigned')
                    writer.write(field.options.array.elementLength, value[i]);
                else if (type === 'signed')
                    writer.writeSigned(field.options.array.elementLength, value[i]);
                else if (type === 'float')
                    writer.writeFloat(field.options.array.elementLength, value[i]);
                
            } else {
                (value[i] as BitstreamElement).write(writer, { context: parent?.context });
            }
        }
    }
}
