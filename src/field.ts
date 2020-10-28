import { BitstreamElement } from "./element";
import { Deserializer, FieldOptions } from "./field-options";
import { BitstreamReader } from "./reader";
import { Serializer } from "./serializer";
import { FieldDefinition } from "./syntax-element";
import { BitstreamWriter } from "./writer";

export function resolveLength(determinant : LengthDeterminant, instance : any, field : FieldDefinition) {
    if (typeof determinant === 'number')
        return determinant;

    let length = determinant(instance, field);

    if (typeof length !== 'number')
        throw new Error(`Length determinant for field ${field.containingType.name}#${field.name} returned non-number value: ${length}`);

    return length;
}

export class NumberSerializer implements Serializer {
    async read(reader: BitstreamReader, field: FieldDefinition, instance: any) {
        return await reader.read(resolveLength(field.length, instance, field));
    }

    write(writer: BitstreamWriter, field: FieldDefinition, value: any, instance: any) {
        writer.write(resolveLength(field.length, instance, field), value);
    }
}

export class BooleanSerializer implements Serializer {
    async read(reader: BitstreamReader, field: FieldDefinition, instance: any) {
        return await reader.read(resolveLength(field.length, instance, field)) !== 0;
    }

    write(writer: BitstreamWriter, field: FieldDefinition, value: any, instance: any) {
        writer.write(resolveLength(field.length, instance, field), value ? 1 : 0);
    }
}

export class ArraySerializer implements Serializer {
    async read(reader: BitstreamReader, field: FieldDefinition, instance: any) {
        let count = await reader.read(field.options.array.countFieldLength);
        let elements = [];
    
        for (let i = 0; i < count; ++i) {
            let element : BitstreamElement = new (field.options.array.type as any)();
            await element.read(reader);
            elements.push(element);
        }
    
        return elements;
    }

    write(writer: BitstreamWriter, field: FieldDefinition, value: any[], instance: any) {
        let length = value.length;
        let countFieldLength = field.options.array.countFieldLength;

        if (length >= Math.pow(2, countFieldLength)) {
            length = Math.pow(2, countFieldLength) - 1;
        }

        writer.write(field.options.array.countFieldLength, value.length);
        
        for (let i = 0; i < length; ++i) {
            value[i].write(writer);
        }
    }
}

export class BufferSerializer implements Serializer {
    async read(reader: BitstreamReader, field: FieldDefinition, instance: any) {
        let buffer = Buffer.alloc(resolveLength(field.length, instance, field) / 8);
        for (let i = 0, max = buffer.length; i < max; ++i)
            buffer[i] = await reader.read(8);
        return buffer;
    }

    write(writer: BitstreamWriter, field: FieldDefinition, value: Buffer, instance: any) {
        let fieldLength = Math.floor(resolveLength(field.length, instance, field) / 8);

        if (value.length > fieldLength) {
            writer.writeBuffer(value.subarray(0, resolveLength(field.length, instance, field)));
        } else {
            writer.writeBuffer(value);
            if (value.length < fieldLength)
                writer.writeBuffer(Buffer.alloc(fieldLength - value.length, 0));
        }
    }
}

export class StringSerializer implements Serializer {
    async read(reader: BitstreamReader, field: FieldDefinition, instance: any) {
        return await reader.readString(resolveLength(field.length, instance, field), field.options.string);
    }

    write(writer: BitstreamWriter, field: FieldDefinition, value: string, instance: any) {
        writer.writeString(resolveLength(field.length, instance, field), `${value}`, field?.options?.string?.encoding || 'utf-8');
    }
}

export class StructureSerializer implements Serializer {
    async read(reader: BitstreamReader, field: FieldDefinition, instance: any) {
        let element : BitstreamElement = new (field.type as any)();
        await element.read(reader);
        return element;
    }

    write(writer: BitstreamWriter, field: FieldDefinition, value: BitstreamElement, instance: any) {
        value.write(writer);
    }
}

export type LengthDeterminant = number | ((any, BitstreamSyntaxElement) => number);

export function Field(length? : LengthDeterminant, options? : FieldOptions) {
    if (!options)
        options = {};
    
    return (target : any, fieldName : string) => {
        let containingType = target.constructor;

        if (!(containingType as Object).hasOwnProperty('ownSyntax')) {
            containingType.ownSyntax = [];
        }

        let field : FieldDefinition = { 
            name: fieldName, 
            containingType,
            type: Reflect.getMetadata('design:type', target, fieldName),
            length, 
            options 
        }

        if (field.type === Buffer && typeof field.length === 'number' && field.length % 8 !== 0)
            throw new Error(`${containingType.name}#${field.name}: Length (${field.length}) must be a multiple of 8 when field type is Buffer`);

        if (field.type === Array) {
            if (!field.options.array?.type)
                throw new Error(`${containingType.name}#${field.name}: Array field must specify option array.type`);
            if (!(field.options.array?.type.prototype instanceof BitstreamElement))
                throw new Error(`${containingType.name}#${field.name}: Array fields can only be used with types which inherit from BitstreamElement`);
            if (typeof field.options.array?.countFieldLength !== 'number' || field.options.array?.countFieldLength <= 0)
                throw new Error(`${containingType.name}#${field.name}: Invalid value provided for length of count field: ${field.options.array?.countFieldLength}`);
        }

        if (!options.serializer) {
            if (field.type === Object)
                options.serializer = new NumberSerializer();
            else if (field.type === Number)
                options.serializer = new NumberSerializer();
            else if (field.type === Boolean)
                options.serializer = new BooleanSerializer();
            else if (field.type === Buffer)
                options.serializer = new BufferSerializer();
            else if (field.type === String)
                options.serializer = new StringSerializer();
            else if (field.type.prototype instanceof BitstreamElement)
                options.serializer = new StructureSerializer();
            else if (field.type === Array)
                options.serializer = new ArraySerializer();
            else
                throw new Error(`No serializer available for field ${field.name} with type ${field.type.name}`);
        }

        (<FieldDefinition[]>containingType.ownSyntax).push(field);
    }
}
