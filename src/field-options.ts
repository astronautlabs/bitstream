import { BitstreamReader } from "./reader";
import { BitstreamSyntaxElement } from "./syntax-element";

export type Deserializer = (reader : BitstreamReader, field : BitstreamSyntaxElement) => any;

export interface FieldOptions {
    deserializer? : Deserializer;
    group? : string;
}
