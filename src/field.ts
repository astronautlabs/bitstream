import { FieldOptions } from "./field-options";
import { BitstreamSyntaxElement } from "./syntax-element";

export function Field(length : number, options? : FieldOptions) {
    if (!options)
        options = {};
    
    return (target : any, fieldName : string) => {
        let classPrototype = Object.getPrototypeOf(target.constructor);

        if (!classPrototype.syntax) {
            classPrototype.syntax = [];
            classPrototype.bitLength = 0;
        }

        let serializer = (v : number) => <any>v;
        
        if (!options.deserializer) {
            let type = Reflect.getMetadata('design:type', target, fieldName);
            if (type === Boolean)
                serializer = v => v !== 0;

                options.deserializer = serializer;
        }

        (<BitstreamSyntaxElement[]>classPrototype.syntax).push({ 
            name: fieldName, 
            length, 
            options 
        });

        classPrototype.bitLength += length;
    }
}
