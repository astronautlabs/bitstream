import { BitstreamReader, BitstreamWriter } from "../bitstream";
import { Serializer } from "./serializer";
import { FieldDefinition } from "./field-definition";
import { BitstreamElement } from "./element";
import { resolveLength } from "./resolve-length";
import { IncompleteReadResult } from "../common";
import { summarizeField } from "./utils";

/**
 * Serializes buffers to/from bitstreams
 */
 export class BufferSerializer implements Serializer {
    *read(reader: BitstreamReader, type : any, parent : BitstreamElement, field: FieldDefinition): Generator<IncompleteReadResult, any> {
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
        
        let gen = reader.readBytes(buffer);

        while (true) {
            let result = gen.next();
            if (result.done === false)
                yield { remaining: result.value*8, contextHint: () => summarizeField(field) };
            else
                break;
        }

        return buffer;
    }

    write(writer: BitstreamWriter, type : any, parent : BitstreamElement, field: FieldDefinition, value: Uint8Array) {
        let length : number;

        try {
            length = resolveLength(field.length, parent, field) / 8;
        } catch (e) {
            throw new Error(`Failed to resolve length for buffer via 'length': ${e.message}`);
        }

        let fieldLength = Math.floor(length);
        let truncate = field.options?.buffer?.truncate ?? true;
        let fill = field.options?.buffer?.fill ?? (truncate ? 0 : false);

        if (!value) {
            throw new Error(`BufferSerializer: Field ${String(field.name)}: Cannot encode a null buffer`);
        }

        if (value.length > fieldLength) {
            if (truncate) {
                writer.writeBuffer(value.subarray(0, fieldLength));
                return;
            }
        } else if (value.length < fieldLength) {
            if (fill !== false) {
                let filledBuffer = new Uint8Array(fieldLength).fill(fill);

                for (let i = 0, max = value.length; i < max; ++i)
                    filledBuffer[i] = value[i];
                
                writer.writeBuffer(filledBuffer);
                return;
            }
        }

        writer.writeBuffer(value);
    }
}
