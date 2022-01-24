import { BitstreamElement } from "./element";
import { Serializer } from "./serializer";
import { FieldDefinition } from "./field-definition";
import { BitstreamReader, BitstreamWriter } from "../bitstream";

/**
 * Serializes BitstreamElement instances to/from bitstreams
 */
export class StructureSerializer implements Serializer {
    *read(reader : BitstreamReader, type : typeof BitstreamElement, parent : BitstreamElement, field : FieldDefinition) {
        let g = type.read(reader, { parent, field, context: parent.context });
        while (true) {
            let result = g.next();
            if (result.done === false)
                yield result.value;
            else
                return result.value;
        }
    }
    
    write(writer: BitstreamWriter, type : any, instance: any, field: FieldDefinition, value: BitstreamElement) {
        if (!value)
            throw new Error(`Cannot write ${field.type.name}#${String(field.name)}: Value is null/undefined`);
        value.write(writer, { skip: field.options?.skip });
    }
}
