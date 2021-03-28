export interface BufferOptions {
    /**
     * When true (default), the buffer will be truncated based on the calculated field length when writing.
     * When false, the buffer will be written out in it's entirety, regardless of the calculated field length.
     * Disabling truncation can be useful when an earlier field determines how many bytes to *read*, but when 
     * writing is determined by the size of this buffer (usually via writtenValue).  
     */
    truncate?: boolean;
}