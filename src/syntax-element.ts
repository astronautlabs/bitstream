import { FieldOptions } from "./field-options";

export interface BitstreamSyntaxElement {
    length : number;
    name : string;
    type : Function;
    options : FieldOptions;
}
