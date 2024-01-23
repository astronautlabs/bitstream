import { BitstreamElement } from "./element";
import { Field } from "./field";
import { FieldDefinition } from "./field-definition";
import { FieldOptions } from "./field-options";
import { LengthDeterminant } from "./length-determinant";

/**
 * Used to mark a specific field as reserved. The value in this field will be read, but will not be 
 * copied into the BitsreamElement, and when writing the value will always be all low bits. For a 
 * version using high bits, see `@Reserved`
 * @param length The bitlength determinant
 * @param options Options related to this reserved field
 */
 export function ReservedLow<T extends BitstreamElement>(length : LengthDeterminant, options? : FieldOptions<T>) {
    if (!options)
        options = {};

    options.isIgnored = true;
    options.writtenValue = (instance, field : FieldDefinition) => {
        if (field.type === Number)
            return 0;
    };

    let decorator = Field(length, options);
    return (target : T, fieldName : string | symbol) => {
        fieldName = Symbol(`[reserved: ${typeof length === 'number' ? `${length} bits` : `dynamic`}]`);
        Reflect.defineMetadata('design:type', Number, target, fieldName);
        return decorator(target, fieldName);
    }
}