import { BitstreamElement } from "./element";
import { Deserializer, FieldOptions } from "./field-options";
import { BitstreamReader } from "./reader";
import { BitstreamSyntaxElement } from "./syntax-element";

function numberSerializer(reader : BitstreamReader, field : BitstreamSyntaxElement) {
    return reader.readSync(field.length);
}

function booleanSerializer(reader : BitstreamReader, field : BitstreamSyntaxElement) {
    return numberSerializer(reader, field) !== 0;
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
        let classPrototype = target.constructor;

        if (!(classPrototype as Object).hasOwnProperty('syntax')) {
            classPrototype.syntax = [];
        }

        let field : BitstreamSyntaxElement = { 
            name: fieldName, 
            type: Reflect.getMetadata('design:type', target, fieldName),
            length, 
            options 
        }

        if (!options.deserializer) {
            if (field.type === Object)
                options.deserializer = numberSerializer;
            else if (field.type === Number)
                options.deserializer = numberSerializer;
            else if (field.type === Boolean)
                options.deserializer = (reader, field) => numberSerializer(reader, field) !== 0;
            else if (field.type.prototype instanceof BitstreamElement)
                options.deserializer = structureSerializer;
            else
                throw new Error(`No deserializer available for field ${field.name} with type ${field.type.name}`);
        }

        (<BitstreamSyntaxElement[]>classPrototype.syntax).push(field);
    }
}
