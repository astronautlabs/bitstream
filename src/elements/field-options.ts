import { StringEncodingOptions } from "../bitstream";
import { ArrayOptions } from "./array-options";
import { BufferOptions } from "./buffer-options";
import { Discriminant } from "../common";
import { Serializer } from "./serializer";
import { ValueDeterminant } from "./value-determinant";
import { VariantDefinition } from "./variant-definition";

/**
 * Defines options available for properties marked with `@Field()` within BitstreamElement classes.
 */
export interface FieldOptions {
    /**
     * Specify a custom serializer for this field. If not specified, this option will be 
     * filled based on the runtime type metadata available for the given field. For instance,
     * if the field is of type Number, it will get a NumberSerializer, if the type is a subclass 
     * of BitstreamElement, it will get StructureSerializer, etc.
     */
    serializer? : Serializer;

    /**
     * Specify options specific to string fields, such as text encoding and null termination.
     */
    string? : StringEncodingOptions;

    /**
     * Specify options specific to array fields, such as how the length of the array should be 
     * determined and what element type the array is (because Typescript does not expose the type of 
     * an array field)
     */
    array? : ArrayOptions;

    /**
     * Specify options specific to Buffer fields
     */
    buffer? : BufferOptions;

    /**
     * Define a group name that this field falls within. This is not used by default and is only useful
     * when implementing custom reading and writing code.
     */
    group? : string;

    /**
     * Define a function that indicates when the field is present within the bitstream. This is the opposite
     * of `excludedWhen`.
     */
    presentWhen? : Discriminant;

    /**
     * Define a function that indicates when the field is absent within the bitstream. This is the opposite 
     * of `presentWhen`.
     */
    excludedWhen? : Discriminant;

    /**
     * Specify a set of subclasses which should be considered when variating this field. When not specified,
     * all subclasses marked with `@Variant` are considered, this option lets you narrow the options in specific
     * cases
     */
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
