import { BitstreamElement } from "./element";
import { Deserializer, FieldOptions } from "./field-options";
import { BitstreamReader } from "./reader";
import { BitstreamSyntaxElement } from "./syntax-element";

export function resolveLength(determinant : LengthDeterminant, instance : any, field : BitstreamSyntaxElement) {
    if (typeof determinant === 'number')
        return determinant;

    let length = determinant(instance, field);

    if (typeof length !== 'number')
        throw new Error(`Length determinant for field ${field.containingType.name}#${field.name} returned non-number value: ${length}`);

    return length;
}

async function numberDeserializer(reader : BitstreamReader, field : BitstreamSyntaxElement, instance : any) {
    return await reader.read(resolveLength(field.length, instance, field));
}

async function booleanDeserializer(reader : BitstreamReader, field : BitstreamSyntaxElement, instance : any) {
    return await numberDeserializer(reader, field, instance) !== 0;
}

async function arrayDeserializer(reader : BitstreamReader, field : BitstreamSyntaxElement, instance : any) {
    let count = await reader.read(field.options.array.countFieldLength);
    let elements = [];

    for (let i = 0; i < count; ++i) {
        let element : BitstreamElement = new (field.options.array.elementType as any)();
        await element.deserializeFrom(reader);
        elements.push(element);
    }

    return elements;
}

async function bufferDeserializer(reader : BitstreamReader, field : BitstreamSyntaxElement, instance : any) {
    let buffer = Buffer.alloc(resolveLength(field.length, instance, field) / 8);
    for (let i = 0, max = buffer.length; i < max; ++i)
        buffer[i] = await reader.read(8);
    return buffer;
}

async function stringDeserializer(reader : BitstreamReader, field : BitstreamSyntaxElement, instance : any) {
    return await reader.readString(resolveLength(field.length, instance, field), field.options.stringEncoding);
}

async function structureDeserializer(reader : BitstreamReader, field : BitstreamSyntaxElement) {
    let element : BitstreamElement = new (field.type as any)();
    await element.deserializeFrom(reader);
    return element;
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

        let field : BitstreamSyntaxElement = { 
            name: fieldName, 
            containingType,
            type: Reflect.getMetadata('design:type', target, fieldName),
            length, 
            options 
        }

        if (field.type === Buffer && typeof field.length === 'number' && field.length % 8 !== 0)
            throw new Error(`${containingType.name}#${field.name}: Length (${field.length}) must be a multiple of 8 when field type is Buffer`);

        if (field.type === Array) {
            if (!field.options.array?.elementType)
                throw new Error(`${containingType.name}#${field.name}: Array field must specify option array.elementType`);
            if (!(field.options.array?.elementType.prototype instanceof BitstreamElement))
                throw new Error(`${containingType.name}#${field.name}: Array fields can only be used with types which inherit from BitstreamElement`);
            if (typeof field.options.array?.countFieldLength !== 'number' || field.options.array?.countFieldLength <= 0)
                throw new Error(`${containingType.name}#${field.name}: Invalid value provided for length of count field: ${field.options.array?.countFieldLength}`);
        }

        if (!options.deserializer) {
            if (field.type === Object)
                options.deserializer = numberDeserializer;
            else if (field.type === Number)
                options.deserializer = numberDeserializer;
            else if (field.type === Boolean)
                options.deserializer = booleanDeserializer;
            else if (field.type === Buffer)
                options.deserializer = bufferDeserializer;
            else if (field.type === String)
                options.deserializer = stringDeserializer;
            else if (field.type.prototype instanceof BitstreamElement)
                options.deserializer = structureDeserializer;
            else if (field.type === Array)
                options.deserializer = arrayDeserializer;
            else
                throw new Error(`No deserializer available for field ${field.name} with type ${field.type.name}`);
        }

        (<BitstreamSyntaxElement[]>containingType.ownSyntax).push(field);
    }
}
