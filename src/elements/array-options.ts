import { BitstreamElement } from "./element";
import { LengthDeterminant } from "./length-determinant";

export type HasMore<ArrayT = any, InstanceT = any, ParentT = any> = (array : ArrayT, element : InstanceT, parent? : ParentT) => boolean;

export interface ArrayOptions<T extends BitstreamElement> {
    /**
     * The length (in bits) of the count field which 
     * precedes the data of the array. 
     * 
     * Only one of `count`, `countFieldLength`, `hasMore` can be specified simultaneously.
     */
    countFieldLength? : number;

    /**
     * The number of items in the array. Can be a fixed number or 
     * can be dependent on the fields already parsed. When writing the structure
     * to bitstream, this value must be less than or equal to the number of items 
     * in the provided array. When the value is greater than the number of items in 
     * an array, an exception is thrown. When the value is less than the number of items in 
     * an array, the number of items written is truncated to the count.
     * 
     * Note that you can specify `count` or `countFieldLength` but not both. When `count` 
     * is specified, no length field is written as part of the array field (because it is presumed
     * to be an implied length, or the length is represented elsewhere in the structure).
     * 
     * Only one of `count`, `countFieldLength`, `hasMore` can be specified simultaneously.
     */
    count? : LengthDeterminant<T>;

    /**
     * Whether to read another item. When specified, the discriminant is executed before reading each item.
     * If the discriminant returns true, another item is read, If false, the field is finalized and parsing continues
     * on.
     * 
     * Only one of `count`, `countFieldLength`, `hasMore` can be specified simultaneously.
     */
    hasMore? : HasMore;

    /**
     * The Javascript type of the elements of this array.
     * Can either be a class that extends from BitstreamElement
     * or `Number`. 
     */
    type? : Function;

    /**
     * How long each element is in bits. This is only 
     * meaningful for array fields where `type` is 
     * set to Number.
     */
    elementLength? : number;
}