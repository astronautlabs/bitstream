
export type InferredPropertyDecorator<T, K extends string | symbol = string | symbol> = (target: T, fieldName: K) => void;

/**
 * Resolves to the type of the given property K on type T unless K is not 
 * a property of T, in which case the result is U. 
 * 
 * Solves an inferrence case with private fields, which cannot be accessed via type, 
 * so we want to revert to any without causing an error.
 */
export type PropType<T, K, U = any> = K extends keyof T ? T[K] : U;