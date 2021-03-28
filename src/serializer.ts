import { BitstreamElement } from "./element";
import { FieldOptions } from "./field-options";
import { BitstreamReader } from "./reader";
import { FieldDefinition } from "./syntax-element";
import { BitstreamWriter } from "./writer";

/**
 * The abstract interface of a value serializer used within BitstreamElement.
 * The library comes with a number of built-in Serializers, or you can create your own
 * and use them by specifying the `serializer` option of `@Field()`
 */
export interface Serializer {
    read(reader : BitstreamReader, type : any, parent : BitstreamElement, field : FieldDefinition) : Promise<any>;
    write(writer : BitstreamWriter, type : any, parent : BitstreamElement, field : FieldDefinition, value : any);
}
