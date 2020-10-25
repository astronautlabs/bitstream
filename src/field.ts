import { BitstreamElement } from "./element";
import { Deserializer, FieldOptions } from "./field-options";
import { BitstreamReader } from "./reader";
import { BitstreamSyntaxElement } from "./syntax-element";

function numberDeserializer(reader : BitstreamReader, field : BitstreamSyntaxElement) {
    return reader.readSync(field.length);
}

function booleanDeserializer(reader : BitstreamReader, field : BitstreamSyntaxElement) {
    return numberDeserializer(reader, field) !== 0;
}

function bufferDeserializer(reader : BitstreamReader, field : BitstreamSyntaxElement) {
    let buffer = Buffer.alloc(field.length / 8);
    for (let i = 0, max = buffer.length; i < max; ++i)
        buffer[i] = reader.readSync(8);
    return buffer;
}

function stringDeserializer(reader : BitstreamReader, field : BitstreamSyntaxElement) {
    return reader.readStringSync(field.length, field.options.stringEncoding);
}

function structureSerializer(reader : BitstreamReader, field : BitstreamSyntaxElement) {
    let element : BitstreamElement = new (field.type as any)();
    element.deserializeFrom(reader);
    return element;
}

export function Field(length? : number, options? : FieldOptions) {
    if (!options)
        options = {};
    
    return (target : any, fieldName : string) => {
        let elementClass = target.constructor;

        if (!(elementClass as Object).hasOwnProperty('ownSyntax')) {
            elementClass.ownSyntax = [];
        }

        let field : BitstreamSyntaxElement = { 
            name: fieldName, 
            type: Reflect.getMetadata('design:type', target, fieldName),
            length, 
            options 
        }

        if (field.type === Buffer && field.length % 8 !== 0)
            throw new Error(`${elementClass.name}#${field.name}: Length (${field.length}) must be a multiple of 8 when field type is Buffer`);

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
                options.deserializer = structureSerializer;
            else
                throw new Error(`No deserializer available for field ${field.name} with type ${field.type.name}`);
        }

        (<BitstreamSyntaxElement[]>elementClass.ownSyntax).push(field);
    }
}
