export interface ArrayOptions {
    /**
     * The length (in bits) of the count field which 
     * precedes the data of the array. 
     */
    countFieldLength? : number;

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