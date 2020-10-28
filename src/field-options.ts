import { ArrayOptions } from "./array-options";
import { BitstreamReader } from "./reader";
import { Serializer } from "./serializer";
import { StringEncodingOptions } from "./string-encoding-options";
import { FieldDefinition } from "./syntax-element";

export type Deserializer = (reader : BitstreamReader, field : FieldDefinition, instance : any) => Promise<any>;

export interface FieldOptions {
    serializer? : Serializer;
    string? : StringEncodingOptions;
    array? : ArrayOptions;
    group? : string;
}
