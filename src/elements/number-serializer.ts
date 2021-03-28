import { BitstreamElement } from "./element";
import { resolveLength } from "./resolve-length";
import { Serializer } from "./serializer";
import { FieldDefinition } from "./field-definition";
import { BitstreamReader, BitstreamWriter } from "../bitstream";

/**
 * Serializes numbers to/from bitstreams
 */
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
