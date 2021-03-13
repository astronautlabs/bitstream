import { BitstreamReader } from "./reader";
import { FieldDefinition } from "./syntax-element";

export type Deserializer = (reader : BitstreamReader, field : FieldDefinition, instance : any) => Promise<any>;