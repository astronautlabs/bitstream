import { Discriminant } from "./discriminant";
import { Field } from "./field";

interface Constructor<T = any> {
    new(...args) : T;
}

export interface VariantDefinition {
    type : Constructor;
    discriminant : Discriminant;
    options : VariantOptions;
}

export interface VariantOptions {
    priority? : 'first' | 'last' | number;
}

export function Variant<T = any>(discriminant : Discriminant<T>, options? : VariantOptions) {
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

export function DefaultVariant() {
    return Variant(() => true, { priority: 'last' });
}

export function VariantMarker() {
    return Field(0, { isVariantMarker: true })
}