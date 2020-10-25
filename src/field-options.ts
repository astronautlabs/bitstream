import { ArrayOptions } from "./array-options";
import { BitstreamReader } from "./reader";
import { StringEncodingOptions } from "./string-encoding-options";
import { BitstreamSyntaxElement } from "./syntax-element";

export type Deserializer = (reader : BitstreamReader, field : BitstreamSyntaxElement, instance : any) => Promise<any>;

export interface FieldOptions {
    deserializer? : Deserializer;
    string? : StringEncodingOptions;
    array? : ArrayOptions;
    group? : string;
}
