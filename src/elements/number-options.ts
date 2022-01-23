export interface NumberOptions {
    /**
     * Binary format to use for this number field.
     * - `unsigned`: The value is treated as an unsigned integer
     * - `signed`: The value is treated as a signed two's complement integer
     * - `float`: The value is treated as an IEEE 754 floating point number.
     *   Only lengths of 32 (32-bit single-precision) and 64
     *   (64-bit double-precision) bits are supported
     */
    format : 'unsigned' | 'signed' | 'float';
}