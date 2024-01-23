import { BitstreamReader, BitstreamWriter } from "../bitstream";
import { IncompleteReadResult } from "../common";
import { BitstreamElement } from "./element";
import { FieldDefinition } from "./field-definition";

/**
 * The abstract interface of a value serializer used within BitstreamElement.
 * The library comes with a number of built-in Serializers, or you can create your own
 * and use them by specifying the `serializer` option of `@Field()`
 */
export interface Serializer {
    read(reader : BitstreamReader, type : Function, parent : BitstreamElement, field : FieldDefinition) : Generator<IncompleteReadResult, any>;
    write(writer : BitstreamWriter, type : Function, parent : BitstreamElement, field : FieldDefinition, value : any);
}
