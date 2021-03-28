import { BitstreamElement } from "./element";
import { Serializer } from "./serializer";
import { FieldDefinition } from "./field-definition";
import { VariantDefinition } from "./variant-definition";
import { BitstreamReader, BitstreamWriter } from "../bitstream";

/**
 * Serializes BitstreamElement instances to/from bitstreams
 */
export class StructureSerializer implements Serializer {
    async read(reader: BitstreamReader, type : any, parent: BitstreamElement, defn : FieldDefinition, baseElement? : BitstreamElement) {
        let element : BitstreamElement = new type();
        element.parent = parent;

        let parentStillReading = baseElement ? baseElement.isBeingRead : false;
        element.isBeingRead = true;

        let variator = async () => {
            let elementType : any = element.constructor;
            let variants : VariantDefinition[] = elementType.variants;
            
            if (defn && defn.options.variants) {
                variants = defn.options.variants.map((typeOrVariant : any) => 
                    typeof typeOrVariant === 'function' 
                        ? (<VariantDefinition>{ type, discriminant: type.variantDiscriminant })
                        : typeOrVariant
                );
            }

            variants = variants.sort((a, b) => {
                let aPriority = a.options.priority || 0;
                let bPriority = b.options.priority || 0;

                if (aPriority === 'first') aPriority = Number.MIN_SAFE_INTEGER;
                if (aPriority === 'last') aPriority = Number.MAX_SAFE_INTEGER;
                
                if (bPriority === 'first') bPriority = Number.MIN_SAFE_INTEGER;
                if (bPriority === 'last') bPriority = Number.MAX_SAFE_INTEGER;
                
                return aPriority - bPriority;
            });

            if (variants) {
                let match = variants.find(v => v.discriminant(element, parent));
                if (match) {
                    return element = await this.read(reader, match.type, parent, defn, element);
                }
            }

            return element;
        };

        if (baseElement) {
            element.syntax.forEach(f => {
                if (defn?.options?.skip && defn.options.skip.includes(f.name))
                    return;

                if (baseElement.syntax.some(x => x.name === f.name) && baseElement.readFields.includes(f.name)) {
                    if (!f.options.isIgnored)
                        element[f.name] = baseElement[f.name];
                    element.readFields.push(f.name);
                }
            });

            await element.readOwn(reader, variator, { skip: defn?.options?.skip });
        } else {
            await element.read(reader, variator, { skip: defn?.options?.skip });
        }

        if (globalThis.BITSTREAM_TRACE)
            console.log(`Done reading ${element.constructor.name}, isBeingRead=${parentStillReading}`);
        element.isBeingRead = parentStillReading;

        if (!element.ownSyntax.some(x => x.options.isVariantMarker)) {
            if (globalThis.BITSTREAM_TRACE)
                console.log(`** Variating ${element.constructor.name}`);
            element = await variator();
        }
        
        return element;
    }

    async write(writer: BitstreamWriter, type : any, instance: any, field: FieldDefinition, value: BitstreamElement) {
        if (!value) {
            throw new Error(`Cannot write ${field.type.name}#${String(field.name)}: Value is null/undefined`);
        }
        await value.write(writer, { skip: field.options?.skip });
    }
}
