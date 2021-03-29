import { BitstreamReader, BitstreamWriter } from "../bitstream";
import { BitstreamElement } from "./element";
import { resolveLength } from "./resolve-length";
import { Serializer } from "./serializer";
import { FieldDefinition } from "./field-definition";

/**
 * Serializes booleans to/from bitstreams.
 */
export class BooleanSerializer implements Serializer {
    *read(reader: BitstreamReader, type : any, parent : BitstreamElement, field: FieldDefinition) {
        let length = resolveLength(field.length, parent, field);
        if (!reader.isAvailable(length))
            yield length;

        return reader.readSync(length) !== 0;
    }

    write(writer: BitstreamWriter, type : any, instance: any, field: FieldDefinition, value: any) {
        writer.write(resolveLength(field.length, instance, field), value ? 1 : 0);
    }
}
