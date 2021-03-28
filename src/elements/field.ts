import { ArraySerializer } from "./array-serializer";
import { BooleanSerializer } from "./boolean-serializer";
import { BitstreamElement } from "./element";
import { FieldOptions } from "./field-options";
import { LengthDeterminant } from "./length-determinant";
import { NullSerializer } from "./null-serializer";
import { NumberSerializer } from "./number-serializer";
import { resolveLength } from "./resolve-length";
import { StringSerializer } from "./string-serializer";
import { StructureSerializer } from "./structure-serializer";
import { FieldDefinition } from "./field-definition";
import { BufferSerializer } from "./buffer-serializer";

/**
 * Mark a property of a BitstreamElement subclass as a field that should be read from the bitstream.
 * @param length The length of the field, in bits (except when the field has type Buffer or String, in which case it is in bytes)
 * @param options 
 */
export function Field(length? : LengthDeterminant, options? : FieldOptions) {
    if (!options)
        options = {};
    
    return (target : any, fieldName : string | symbol) => {
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
            throw new Error(`${containingType.name}#${String(field.name)}: Length (${field.length}) must be a multiple of 8 when field type is Buffer`);

        if (field.type === Array) {
            if (!field.options.array?.type)
                throw new Error(`${containingType.name}#${String(field.name)}: Array field must specify option array.type`);
            if (!(field.options.array?.type.prototype instanceof BitstreamElement) && field.options.array?.type !== Number)
                throw new Error(`${containingType.name}#${String(field.name)}: Array fields can only be used with types which inherit from BitstreamElement`);
            if (field.options.array?.countFieldLength) {
                if (typeof field.options.array.countFieldLength !== 'number' || field.options.array.countFieldLength <= 0)
                    throw new Error(`${containingType.name}#${String(field.name)}: Invalid value provided for length of count field: ${field.options.array.countFieldLength}. Must be a positive number.`);
            }

            if (field.options.array?.count) {
                if (typeof field.options.array.count !== 'number' && typeof field.options.array.count !== 'function')
                    throw new Error(`${containingType.name}#${String(field.name)}: Invalid value provided for count determinant: ${field.options.array.count}. Must be a number or function`);
            }
        }

        if (!options.serializer) {
            if (field.type === Array)
                options.serializer = new ArraySerializer();
            else if (field.type?.prototype instanceof BitstreamElement)
                options.serializer = new StructureSerializer();
            else if (field.length === 0)
                options.serializer = new NullSerializer();
            else if (field.type === Object)
                options.serializer = new NumberSerializer();
            else if (field.type === Number)
                options.serializer = new NumberSerializer();
            else if (field.type === Boolean)
                options.serializer = new BooleanSerializer();
            else if (field.type === Buffer)
                options.serializer = new BufferSerializer();
            else if (field.type === String)
                options.serializer = new StringSerializer();
            else
                throw new Error(`${containingType.name}#${String(field.name)}: No serializer available for type ${field.type?.name || '<unknown>'}`);
        }

        (<FieldDefinition[]>containingType.ownSyntax).push(field);
    }
}

/**
 * Used to mark a specific field as reserved. The value in this field will be read, but will not be 
 * copied into the BitsreamElement, and when writing the value will always be all high bits.
 * @param length The bitlength determinant
 * @param options Options related to this reserved field
 */
export function Reserved(length : LengthDeterminant, options? : FieldOptions) {
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
    return (target : any, fieldName : string | symbol) => {
        fieldName = Symbol(`[reserved: ${typeof length === 'number' ? `${length} bits` : `dynamic`}]`);
        Reflect.defineMetadata('design:type', Number, target, fieldName);
        return decorator(target, fieldName);
    }
}

/**
 * Used to mark a location within a BitstreamElement which can be useful when used with measure().
 * Markers are always ignored (meaning they are not actually read/written to the BitstreamElement instance), and
 * they always have a bitlength of zero.
 */
export function Marker() {
    return Field(0, { isIgnored: true });
}