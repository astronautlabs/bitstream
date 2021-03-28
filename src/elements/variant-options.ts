
/**
 * Defines options for a `@Variant` subclass of a BitstreamElement superclass. 
 */
 export interface VariantOptions {
    /**
     * Determine the order in which this variant should be considered during variation.
     * The special values "first" and "last" are used to force the variant to be considered
     * before all others or after all others respectively. Otherwise the value is a number, with
     * lower numbers being considered before higher numbers.
     */
    priority? : 'first' | 'last' | number;
}
