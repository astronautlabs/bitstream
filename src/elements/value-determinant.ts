import { FieldDefinition } from "./field-definition";

/**
 * Determines the value of a certain field. Can be a value or a function that dynamically
 * determines the value based on the current context.
 */
 export type ValueDeterminant<T = any> = T | ((instance : any, f : FieldDefinition) => T);
