import { LengthDeterminant } from "./field";
import { FieldOptions } from "./field-options";

export interface BitstreamSyntaxElement {
    length : LengthDeterminant;
    name : string;
    containingType : Function;
    type : Function;
    options : FieldOptions;
}
