import { BitstreamReader } from "./reader";
import { FieldDefinition } from "./syntax-element";
import { BitstreamWriter } from "./writer";

export interface Serializer {
    read(reader : BitstreamReader, field : FieldDefinition, instance : any) : Promise<any>;
    write(writer : BitstreamWriter, field : FieldDefinition, value : any, instance : any);
}
