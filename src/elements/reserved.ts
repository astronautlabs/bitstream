import { resolveLength } from "./resolve-length";
import { FieldDefinition } from "./field-definition";
import { FieldOptions } from "./field-options";
import { LengthDeterminant } from "./length-determinant";
import { Field } from "./field";
import { BitstreamElement } from "./element";
import { InferredPropertyDecorator } from "./decorators";

/**
 * Used to mark a specific field as reserved. The value in this field will be read, but will not be 
 * copied into the BitsreamElement, and when writing the value will always be all high bits. For a 
 * version using low bits, see `@ReservedLow`.
 * 
 * Oftentimes it is desirable to avoid naming reserved fields, especially in formats with lots of small reservation
 * sections. Unfortunately Typescript doesn't provide a good way to do this (computed symbol names cannot be generated by
 * function calls).
 * 
 * However, be assured that if you reuse a reserved field name in a subclass (which is not itself an error in Typescript),
 * the resulting bitstream representation will still be correct. There are two reasons for this:
 * - Every new field declaration is a new syntax field, even if the field exists in a superclass.
 * - `@Reserved()` specifically replaces the name you specify with an anonymous symbol
 * 
 * @param length The bitlength determinant
 * @param options Options related to this reserved field
 */

export function Reserved<T extends BitstreamElement>(length : LengthDeterminant<T>, options : Omit<FieldOptions<T, number>, 'writtenValue' | 'isIgnored'> = {}): InferredPropertyDecorator<T>
 {
    return (target : T, fieldName : string | symbol) => {
        fieldName = Symbol(`[reserved: ${typeof length === 'number' ? `${length} bits` : `dynamic`}]`);
        Reflect.defineMetadata('design:type', Number, target, fieldName);

        return Field<T, number>(length, {
            ...options,
            isIgnored: true,
            writtenValue: (instance, field : FieldDefinition) => {
                if (field.type === Number) {
                    let currentLength = resolveLength(field.length, instance, field);
                    return Math.pow(2, currentLength) - 1;
                }
            }
        })(target, fieldName);
    }
}