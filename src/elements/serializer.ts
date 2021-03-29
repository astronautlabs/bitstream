import { BitstreamReader, BitstreamWriter } from "../bitstream";
import { BitstreamElement } from "./element";
import { FieldDefinition } from "./field-definition";

/**
 * The abstract interface of a value serializer used within BitstreamElement.
 * The library comes with a number of built-in Serializers, or you can create your own
 * and use them by specifying the `serializer` option of `@Field()`
 */
export interface Serializer {
    read(reader : BitstreamReader, type : any, parent : BitstreamElement, field : FieldDefinition) : Generator<number, any>;
    write(writer : BitstreamWriter, type : any, parent : BitstreamElement, field : FieldDefinition, value : any);
}
