export interface BooleanOptions {
    /**
     * Numeric value to use when writing true to bitstream.
     * Also used to interpret values read from the bitstream 
     * according to the chosen 'mode'. The default value is 1.
     */
    true? : number;

    /**
     * Numeric value to use when writing false to bitstream.
     * Also used to interpret values read from the bitstream 
     * according to the chosen 'mode'. The default value is 0.
     */
    false? : number;

    /**
     * Numeric value to use when writing `undefined` to bitstream.
     * The default value is 0.
     */
    undefined? : number;

    /**
     * How to handle serialization of booleans.
     * - `true-unless`: The value is true unless the numeric 
     *   value chosen for 'false' is observed (default mode).
     *   For example `0` is `false`, `1` is `true`, `100` is `true`
     * - `false-unless`: The value is false unless the numeric
     *   value chosen for 'true' is observed. For example `0` is 
     *   `false`, `1` is `true`, `100` is `false`
     * - `undefined`: The value is true when the numeric value 
     *   chosen for 'true' is observed. The value is false when
     *   the numeric value chosen for 'false' is observed. In
     *   all other cases, the value will be serialized as `undefined`.
     *   Note that you should choose a numeric value for 'undefined' 
     *   to ensure `undefined` values do not collapse to the 'false'
     *   value when writing to the bitstream. For example `0` is 
     *   `false`, `1` is `true`, `100` is `undefined`.
     */
    mode? : 'true-unless' | 'false-unless' | 'undefined';
}