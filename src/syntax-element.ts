import { LengthDeterminant } from "./field";
import { FieldOptions } from "./field-options";

/**
 * Defines the structure of a field definition within a BitstreamElement superclass.
 * @see Field 
 * @see BitstreamElement
 */
export interface FieldDefinition {
    length : LengthDeterminant;
    name : string | symbol;
    containingType : Function;
    type : Function;
    options : FieldOptions;
}
