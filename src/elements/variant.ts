import { Field } from "./field";
import { VariantDefinition, VariantDiscriminant } from "./variant-definition";
import { VariantOptions } from "./variant-options";


/**
 * Decorator which can be applied to subclasses of a BitstreamElement class which marks the subclass 
 * as an option for "upgrading" an element being read. In order for the subclass to be considered, the 
 * given discriminant function must be true when called passing the instance of the superclass which is 
 * currently being read. The process of determining which variant subclass should be used is called "variation".
 * By default variation occurs once all fields of the superclass have been read unless the superclass has a
 * `@VariantMarker` decorator, in which case it is performed at the point in the structure where the variant 
 * marker is placed.
 * 
 * @param discriminant A function which determines whether the Variant is valid for a given object being read
 * @param options A set of options that modify the applicability of the variant. @see VariantOptions
 */
export function Variant<T = any>(discriminant : VariantDiscriminant<T>, options? : VariantOptions) {
    return type => {
        let parent = Object.getPrototypeOf(type.prototype).constructor;

        if (!(<Object>parent).hasOwnProperty('ownVariants'))
            Object.defineProperty(parent, 'ownVariants', { value: [] });

        if (!options)
            options = {};
        
        parent.ownVariants.push(<VariantDefinition>{ type, discriminant, options });
        type.variantDiscriminant = discriminant;
    };
}

/**
 * This decorator is a special form of `@Variant` which marks the subclass as the "least priority default" 
 * variant subclass.
 * This is equivalent to `@Variant(() => true, { priority: 'last' })`
 */
export function DefaultVariant() {
    return Variant(() => true, { priority: 'last' });
}

/**
 * A decorator which can be applied to a marker in a BitstreamElement class that indicates where 
 * fields of a variant subclass should be read relative to the other fields of the class. This can be 
 * used to "sandwich" subclass fields in a specific spot between two fields of the superclass.
 */
export function VariantMarker() {
    return Field(0, { isVariantMarker: true })
}