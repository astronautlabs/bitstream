import { Constructor } from "../common";
import { BitstreamElement } from "./element";
import { VariantOptions } from "./variant-options";

export type VariantDiscriminant<T extends BitstreamElement> = (element : T, parent? : T['parent']) => boolean;

/**
 * Defines the structure of a Variant subclass of a BitstreamElement superclass.
 * 
 * @see Variant
 * @see VariantMarker
 */
 export interface VariantDefinition<T extends BitstreamElement = BitstreamElement> {
    type : Constructor;
    discriminant : VariantDiscriminant<T>;
    options : VariantOptions;
}