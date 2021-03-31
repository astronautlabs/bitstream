import { BitstreamReader, BitstreamWriter } from "../bitstream";
import { Serializer } from "./serializer";
import { FieldDefinition } from "./field-definition";
import { BitstreamElement } from "./element";
import { resolveLength } from "./resolve-length";

/**
 * Serializes buffers to/from bitstreams
 */
 export class BufferSerializer implements Serializer {
    *read(reader: BitstreamReader, type : any, parent : BitstreamElement, field: FieldDefinition) {
        let length : number;
        
        try {
            length = resolveLength(field.length, parent, field) / 8;
        } catch (e) {
            throw new Error(`Failed to resolve length for buffer via 'length': ${e.message}`);
        }
        
        let buffer : Uint8Array;
        
        if (typeof Buffer !== 'undefined' && field.type === Buffer)
            buffer = Buffer.alloc(length);
        else
            buffer = new Uint8Array(length);
        
        for (let i = 0, max = buffer.length; i < max; ++i) {
            if (!reader.isAvailable(8))
                yield 8;
            
            buffer[i] = reader.readSync(8);
        }

        return buffer;
    }

    write(writer: BitstreamWriter, type : any, parent : BitstreamElement, field: FieldDefinition, value: Uint8Array) {
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
                    writer.writeBuffer(new Uint8Array(fieldLength - value.length));
            }
        }
    }
}
