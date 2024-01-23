import { BitstreamElement } from "./element";
import { LengthDeterminant } from "./length-determinant";
import { FieldDefinition } from "./field-definition";

/**
 * Given a LengthDeterminant function, a BitstreamElement instance (the context), and a field definition,
 * this function returns the number of bits that should be read. This is used to determine the actual bitlength 
 * of fields when reading and writing BitstreamElement via BitstreamReader and BitstreamWriter.
 * @param determinant The length determinant
 * @param parent The BitstreamElement instance for context
 * @param field The field definition for context
 * @returns The bitlength of the field in this context
 */
 export function resolveLength<T extends BitstreamElement>(determinant : LengthDeterminant<T>, parent : T, field : FieldDefinition) {
    if (typeof determinant === 'number')
        return determinant;

    if (!parent)
        throw new Error(`Cannot resolve length without an instance!`);
    
    let length = parent.runWithFieldBeingComputed(field, () => determinant(parent, field));

    if (typeof length !== 'number')
        throw new Error(`${field.containingType.name}#${String(field.name)}: Length determinant returned non-number value: ${length}`);

    if (length < 0) {
        let message = `${field.containingType.name}#${String(field.name)}: Length determinant returned negative value ${length} -- Value read so far: ${JSON.stringify(parent, undefined, 2)}`;

        console.error(message);
        console.error(`============= Item =============`);
        console.dir(parent);
        let debugParent = parent.parent;
        while (debugParent) {
            console.error(`============= Parent =============`);
            console.dir(debugParent);
            debugParent = debugParent.parent;
        }

        throw new Error(message);
    }

    return length;
}
