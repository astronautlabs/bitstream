import { BitstreamElement } from "./element";
import { FieldOptions } from "./field-options";
import { LengthDeterminant } from "./length-determinant";

/**
 * Defines the structure of a field definition within a BitstreamElement superclass.
 * @see Field 
 * @see BitstreamElement
 */
export interface FieldDefinition<T extends BitstreamElement = BitstreamElement, V = any> {
    length : LengthDeterminant<T>;
    name : string | symbol;
    containingType : Function;
    type : Function;
    options : FieldOptions<T, V>;
}
