import { LengthDeterminant } from "./field";
import { FieldOptions } from "./field-options";

export interface FieldDefinition {
    length : LengthDeterminant;
    name : string | symbol;
    containingType : Function;
    type : Function;
    options : FieldOptions;
}
