import { BitstreamReader, BitstreamWriter } from "../bitstream";
import { BitstreamElement } from "./element";
import { resolveLength } from "./resolve-length";
import { Serializer } from "./serializer";
import { FieldDefinition } from "./field-definition";

/**
 * Serializes strings to/from bitstreams
 */
export class StringSerializer implements Serializer {
    *read(reader: BitstreamReader, type : any, parent : BitstreamElement, field: FieldDefinition) {
        let length = resolveLength(field.length, parent, field);

        if (!reader.isAvailable(length*8))
            yield length*8;
            
        return reader.readStringSync(length, field.options.string);
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
