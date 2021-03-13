import { ArrayOptions } from "./array-options";
import { Discriminant } from "./discriminant";
import { BitstreamReader } from "./reader";
import { Serializer } from "./serializer";
import { StringEncodingOptions } from "./string-encoding-options";
import { FieldDefinition } from "./syntax-element";
import { VariantDefinition } from "./variant";

export interface FieldOptions {
    serializer? : Serializer;
    string? : StringEncodingOptions;
    array? : ArrayOptions;
    group? : string;
    presentWhen? : Discriminant;
    excludedWhen? : Discriminant;
    variants? : (Function | VariantDefinition)[];
    isVariantMarker? : boolean;
}
