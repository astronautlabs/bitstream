export interface NumberOptions {
    /**
     * Binary format to use for this number field.
     * - `unsigned`: The value is treated as an unsigned integer
     * - `signed`: The value is treated as a signed two's complement integer
     * - `float`: The value is treated as an IEEE 754 floating point number.
     *   Only lengths of 32 (32-bit single-precision) and 64
     *   (64-bit double-precision) bits are supported
     */
    format? : 'unsigned' | 'signed' | 'float';

    /**
     * Specify the byte order for this number. 
     * - **big-endian** - Also known as network byte order, this is the default.
     * - **little-endian** - Least significant byte first. Only valid when the field
     *   length is a multiple of 8 bits (ie it contains 1 or more whole bytes)
     */
    byteOrder? : 'big-endian' | 'little-endian';

    /**
     * Allow using the 'number' type on fields longer than 53 bits. Consider using bigint instead of this option.
     */
    allowOversized?: boolean;
}