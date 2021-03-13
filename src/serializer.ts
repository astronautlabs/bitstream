import { BitstreamElement } from "./element";
import { FieldOptions } from "./field-options";
import { BitstreamReader } from "./reader";
import { FieldDefinition } from "./syntax-element";
import { BitstreamWriter } from "./writer";

export interface Serializer {
    read(reader : BitstreamReader, type : any, parent : BitstreamElement, field : FieldDefinition) : Promise<any>;
    write(writer : BitstreamWriter, type : any, parent : BitstreamElement, field : FieldDefinition, value : any);
}
