import { BitstreamReader, BitstreamWriter } from "../bitstream";
import { BitstreamElement } from "./element";
import { Serializer } from "./serializer";
import { FieldDefinition } from "./field-definition";
import { IncompleteReadResult } from "../common";

/**
 * Serializes nothing to/from bitstreams. Used when the field is a no-op, such as for fields decorated with `@Marker`
 */
export class NullSerializer implements Serializer {
    *read(reader: BitstreamReader, type : any, parent : BitstreamElement, field: FieldDefinition): Generator<IncompleteReadResult, any> {
    }

    write(writer: BitstreamWriter, type : any, instance: any, field: FieldDefinition, value: any) {
    }
}
