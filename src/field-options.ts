import { BitstreamReader } from "./reader";
import { StringEncodingOptions } from "./string-encoding-options";
import { BitstreamSyntaxElement } from "./syntax-element";

export type Deserializer = (reader : BitstreamReader, field : BitstreamSyntaxElement) => any;

export interface FieldOptions {
    deserializer? : Deserializer;
    elementType? : Function;
    stringEncoding? : StringEncodingOptions;
    group? : string;
}
