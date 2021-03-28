import { BitstreamReader, BitstreamWriter } from "../bitstream";
import { BitstreamElement } from "./element";
import { resolveLength } from "./resolve-length";
import { Serializer } from "./serializer";
import { FieldDefinition } from "./field-definition";

/**
 * Serializes booleans to/from bitstreams.
 */
export class BooleanSerializer implements Serializer {
    async read(reader: BitstreamReader, type : any, parent : BitstreamElement, field: FieldDefinition) {
        return await reader.read(resolveLength(field.length, parent, field)) !== 0;
    }

    write(writer: BitstreamWriter, type : any, instance: any, field: FieldDefinition, value: any) {
        writer.write(resolveLength(field.length, instance, field), value ? 1 : 0);
    }
}
