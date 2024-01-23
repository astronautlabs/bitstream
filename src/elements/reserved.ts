import { resolveLength } from "./resolve-length";
import { FieldDefinition } from "./field-definition";
import { FieldOptions } from "./field-options";
import { LengthDeterminant } from "./length-determinant";
import { Field } from "./field";
import { BitstreamElement } from "./element";

/**
 * Used to mark a specific field as reserved. The value in this field will be read, but will not be 
 * copied into the BitsreamElement, and when writing the value will always be all high bits. For a 
 * version using low bits, see `@ReservedLow`.
 * @param length The bitlength determinant
 * @param options Options related to this reserved field
 */
 export function Reserved<T extends BitstreamElement>(length : LengthDeterminant, options? : FieldOptions<T>) {
    if (!options)
        options = {};

    options.isIgnored = true;
    options.writtenValue = (instance, field : FieldDefinition) => {
        if (field.type === Number) {
            let currentLength = resolveLength(field.length, instance, field);
            return Math.pow(2, currentLength) - 1;
        }
    };

    let decorator = Field(length, options);
    return (target : T, fieldName : string | symbol) => {
        fieldName = Symbol(`[reserved: ${typeof length === 'number' ? `${length} bits` : `dynamic`}]`);
        Reflect.defineMetadata('design:type', Number, target, fieldName);
        return decorator(target, fieldName);
    }
}