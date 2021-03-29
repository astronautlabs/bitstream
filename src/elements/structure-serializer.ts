import { BitstreamElement } from "./element";
import { Serializer } from "./serializer";
import { FieldDefinition } from "./field-definition";
import { VariantDefinition } from "./variant-definition";
import { BitstreamReader, BitstreamWriter } from "../bitstream";

/**
 * Serializes BitstreamElement instances to/from bitstreams
 */
export class StructureSerializer implements Serializer {
    async read(reader : BitstreamReader, type : any, parent : BitstreamElement, field : FieldDefinition) : Promise<any> {
        return type.read(reader, parent, field);
    }
    
    async write(writer: BitstreamWriter, type : any, instance: any, field: FieldDefinition, value: BitstreamElement) {
        if (!value)
            throw new Error(`Cannot write ${field.type.name}#${String(field.name)}: Value is null/undefined`);
        await value.write(writer, { skip: field.options?.skip });
    }
}
