import { BitstreamReader, StringEncodingOptions } from "../bitstream";
import { ArrayOptions } from "./array-options";
import { BufferOptions } from "./buffer-options";
import { Serializer } from "./serializer";
import { ValueDeterminant } from "./value-determinant";
import { VariantDefinition } from "./variant-definition";
import { NumberOptions } from "./number-options";
import { BooleanOptions } from "./boolean-options";
import { LengthDeterminant } from "./length-determinant";
import { BitstreamElement } from "./element";

export type ReadAheadDiscriminant<T = any> = (buffer: BitstreamReader, element : T) => boolean;

export interface ReadAheadOptions<T extends BitstreamElement> {
    /**
     * How many bits should be read before processing this field.
     */
    length: LengthDeterminant<T>;

    /**
     * When specified, if the given discriminant returns true, the field is parsed. Otherwise it is skipped.
     * 
     * Called after the required number of bits have been read ahead (see `length`), as long as the bitstream has 
     * not ended.
     * 
     * The bitstream reader is placed in simulation mode before calling the discriminant, so it is fine to use 
     * the read*Sync() functions to inspect the peeked data. The state of the stream's read head will be restored to 
     * where it was after the function completes. 
     * 
     * In the case where the stream ended before the requisite number of bits became available, this discriminant is 
     * still called. It is expected that the discriminant will take care in this situation.
     */
    presentWhen?: ReadAheadDiscriminant<T>;

    /**
     * When specified, if the given discriminant returns true, the field is skipped. Otherwise it is parsed.
     * 
     * Called after the required number of bits have been read ahead (see `length`), as long as the bitstream has 
     * not ended.
     * 
     * The bitstream reader is placed in simulation mode before calling the discriminant, so it is fine to use 
     * the read*Sync() functions to inspect the peeked data. The state of the stream's read head will be restored to 
     * where it was after the function completes. 
     * 
     * In the case where the stream ended before the requisite number of bits became available, this discriminant is 
     * still called. It is expected that the discriminant will take care in this situation.
     */
    excludedWhen?: ReadAheadDiscriminant<T>;
}

/**
 * A function which returns true when the given element matches a certain condition
 */
export type PresenceDiscriminant<T = any> = (element : T) => boolean;

/**
 * Defines options available for properties marked with `@Field()` within BitstreamElement classes.
 */
export interface FieldOptions<T extends BitstreamElement, V> {
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
     * Specify options specific to number fields
     */
    number? : NumberOptions;

    /**
     * Specify options specific to boolean fields
     */
    boolean? : BooleanOptions;

    /**
     * Specify options specific to array fields, such as how the length of the array should be 
     * determined and what element type the array is (because Typescript does not expose the type of 
     * an array field)
     */
    array? : ArrayOptions<T>;

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
     * Allows for reading a certain number of bits from the bitstream ahead of attempting to read this field.
     * This can be used to make parsing decisions on upcoming data.
     */
    readAhead?: ReadAheadOptions<T>;

    /**
     * Define a function that indicates when the field is present within the bitstream. This is the opposite
     * of `excludedWhen`.
     */
    presentWhen? : PresenceDiscriminant<T>;

    /**
     * Define a function that indicates when the field is absent within the bitstream. This is the opposite 
     * of `presentWhen`.
     */
    excludedWhen? : PresenceDiscriminant<T>;

    /**
     * Specify a set of subclasses which should be considered when variating this field. When not specified,
     * all subclasses marked with `@Variant` are considered, this option lets you narrow the options in specific
     * cases
     */
    variants? : (Function | VariantDefinition<T>)[];

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
    writtenValue?: ValueDeterminant<T, V>;

    /**
     * Initializer to call when constructing new instances for this field. 
     * The element instance that contains this field will be passed as the second parameter.
     * This is called after constructing the new instance but before any of its fields are 
     * parsed.
     */
    initializer?: (instance: any, parentElement: any) => void;
}
