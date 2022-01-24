/* istanbul ignore file */
import { Field } from "./field";

/**
 * Used to mark a location within a BitstreamElement which can be useful when used with measure().
 * Markers are always ignored (meaning they are not actually read/written to the BitstreamElement instance), and
 * they always have a bitlength of zero.
 */
 export function Marker() {
    return Field(0, { isIgnored: true });
}