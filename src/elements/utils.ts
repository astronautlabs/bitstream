import { FieldDefinition } from "./field-definition";

export function summarizeField(field: FieldDefinition) {
    return `${field.containingType?.name || '<unknown>'}#${String(field.name)}`;
}