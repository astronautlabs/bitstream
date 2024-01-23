import { Constructor } from "../common";
import { VariantOptions } from "./variant-options";

export type VariantDiscriminant<T = any, U = any> = (element : T, parent? : U) => boolean;

/**
 * Defines the structure of a Variant subclass of a BitstreamElement superclass.
 * 
 * @see Variant
 * @see VariantMarker
 */
 export interface VariantDefinition {
    type : Constructor;
    discriminant : VariantDiscriminant;
    options : VariantOptions;
}