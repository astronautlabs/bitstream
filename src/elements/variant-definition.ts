import { Constructor, Discriminant } from "../common";
import { VariantOptions } from "./variant-options";

/**
 * Defines the structure of a Variant subclass of a BitstreamElement superclass.
 * 
 * @see Variant
 * @see VariantMarker
 */
 export interface VariantDefinition {
    type : Constructor;
    discriminant : Discriminant;
    options : VariantOptions;
}