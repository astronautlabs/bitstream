import { ArrayOptions } from "./array-options";
import { BufferOptions } from "./buffer-options";
import { Discriminant } from "./discriminant";
import { ValueDeterminant } from "./field";
import { Serializer } from "./serializer";
import { StringEncodingOptions } from "./string-encoding-options";
import { VariantDefinition } from "./variant";

export interface FieldOptions {
    serializer? : Serializer;
    string? : StringEncodingOptions;
    array? : ArrayOptions;
    buffer? : BufferOptions;
    group? : string;
    presentWhen? : Discriminant;
    excludedWhen? : Discriminant;
    variants? : (Function | VariantDefinition)[];

    /**
     * Specify a set of subfields (by field name) that should be skipped when serializing this field.
     * Only relevant for subelements. For other field types, this is ignored.
     */
    skip?: (string | symbol)[];

    /**
     * When true, the field represents the "variant marker", which is the 
     * location in a superclass where a variant subclass's fields are expected.
     * Not meant to be used directly, instead use `@VariantMarker()`
     */
    isVariantMarker? : boolean;

    /**
     * When true, the value read for this field is thrown away, and not 
     * applied to the serialized instance. This is used by `@Reserved` to represent 
     * reserved bits
     */
    isIgnored? : boolean;

    /**
     * When provided, the value written for this field will be the one listed here,
     * or the result of running the determinant function. Useful for ensuring that 
     * fields with values dependent on other parts of the structure are always written
     * correctly without having to manually update them before writing. It is also used
     * by the `@Reserved()` decorator to ensure that high bits are always written.
     */
    writtenValue?: ValueDeterminant;
}
