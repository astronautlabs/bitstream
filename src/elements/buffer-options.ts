export interface BufferOptions {
    /**
     * When true (default), the buffer will be truncated based on the calculated field length when writing.
     * When false, the buffer will be written out in it's entirety, regardless of the calculated field length.
     * Disabling truncation can be useful when an earlier field determines how many bytes to *read*, but when 
     * writing is determined by the size of this buffer (usually via writtenValue).
     * The default is true.
     */
    truncate?: boolean;

    /**
     * When false, buffers that are shorter than the calculated field length will be written as is. When set to 
     * a number, the buffer will be expanded to the proper size with the new slots filled with the given value. 
     * When this value is unspecified, the default behavior depends on the value of the `truncate` option- when 
     * `truncate` is `true` this option is assumed to be `0` (ie expand and fill with zeroes). When `truncate` is 
     * `false`, this option is assumed to be `false`.
     */
    fill?: number | false;
}