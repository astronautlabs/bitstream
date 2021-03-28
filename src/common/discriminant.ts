/**
 * A function which returns true when the given element matches a certain condition
 */
export type Discriminant<T = any, U = any> = (element : T, parent? : U) => boolean;