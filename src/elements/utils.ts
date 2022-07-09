import { FieldDefinition } from "./field-definition";

export function summarizeField(field: FieldDefinition) {
    return `[${field.options.serializer.constructor.name || '<unknown serializer>'}] ${field.containingType?.name || '<unknown>'}#${String(field.name)}`;
}