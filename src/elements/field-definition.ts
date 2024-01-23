import { BitstreamElement } from "./element";
import { FieldOptions } from "./field-options";
import { LengthDeterminant } from "./length-determinant";

/**
 * Defines the structure of a field definition within a BitstreamElement superclass.
 * @see Field 
 * @see BitstreamElement
 */
export interface FieldDefinition<T extends BitstreamElement = BitstreamElement> {
    length : LengthDeterminant;
    name : string | symbol;
    containingType : Function;
    type : Function;
    options : FieldOptions<T>;
}
