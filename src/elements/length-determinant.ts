import { FieldDefinition } from "./field-definition";

/**
 * Determines the bitlength of a certain field. Can be a number or a function that dynamically
 * determines the value based on the current context.
 */
 export type LengthDeterminant = number | ((instance : any, f : FieldDefinition) => number);
