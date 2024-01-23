import { Constructor } from "../common";
import { InferredPropertyDecorator } from "./decorators";
import { BitstreamElement } from "./element";
import { Field } from "./field";
import { VariantDefinition, VariantDiscriminant } from "./variant-definition";
import { VariantOptions } from "./variant-options";

export interface DiscriminatedVariant {
    variantDiscriminant?: VariantDiscriminant<BitstreamElement>;
}

/**
 * Decorator which can be applied to subclasses of a BitstreamElement class which marks the subclass 
 * as an option for "upgrading" an element being read. In order for the subclass to be considered, the 
 * given discriminant function must be true when called passing the instance of the superclass which is 
 * currently being read. The process of determining which variant subclass should be used is called "variation".
 * By default variation occurs once all fields of the superclass have been read unless the superclass has a
 * `@VariantMarker` decorator, in which case it is performed at the point in the structure where the variant 
 * marker is placed.
 * 
 * Note that the default type assigned to the "element" parameter of the passed variant discriminant is 
 * actually the type that the decorator is placed on, but that's technically not correct, since the passed 
 * value is an instance of the parent class. Right now Typescript doesn't have a way to type this, and we
 * figured it was better to be brief and almost correct than the alternative.
 * 
 * If you want to ensure the type of the element pasesd to the discriminator is exactly correct, specify the 
 * type parameter (ie `@Variant<ParentClass>(i => i.parentProperty)`) 
 * 
 * @param discriminant A function which determines whether the Variant is valid for a given object being read
 * @param options A set of options that modify the applicability of the variant. @see VariantOptions
 */
export function Variant<T extends BitstreamElement>(discriminant : VariantDiscriminant<T>, options? : VariantOptions) {
    return (type: Constructor<T> & typeof BitstreamElement & DiscriminatedVariant) => {
        let parent = Object.getPrototypeOf(type.prototype).constructor;

        if (!(<Object>parent).hasOwnProperty('ownVariants'))
            Object.defineProperty(parent, 'ownVariants', { value: [] });

        if (!options)
            options = {};
        
        parent.ownVariants.push(<VariantDefinition<T>>{ type, discriminant, options });
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
export function VariantMarker<T extends BitstreamElement>(): InferredPropertyDecorator<T> {
    return Field(0, { isVariantMarker: true });
}