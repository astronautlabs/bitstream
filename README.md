# @/bitstream

Typescript utility library for reading and writing to "bitstreams", that is, tightly packed binary streams containing fields 
of varying lengths of bits. This package lets you treat a series of bytes as a series of bits without needing to manage
which bytes the desired fields fall within. Bitstreams are most useful when implementing network protocols and data formats
(both encoders and decoders).

# Usage

`npm install @astronautlabs/bitstream`

## Reading a bitstream

```typescript
import { BitstreamReader } from '@astronautlabs/bitstream';

let reader = new BitstreamReader();

reader.addBuffer(Buffer.from([0b11110000, 0b10001111]));

reader.readSync(2) // == 0b11
reader.readSync(3) // == 0b110
reader.readSync(4) // == 0b0001
reader.readSync(7) // == 0b0001111
```

## Writing a bitstream

```typescript
import { BitstreamWriter } from '@astronautlabs/bitstream';

let writer = new BitstreamWriter(writableStream, bufferLength);

writer.write(2, 0b10);
writer.write(10, 0b1010101010);
writer.write(length, value);
```

Note that any bits in `value` above the `length`'th bit will be ignored, so the following are all equivalent:

```typescript
writer.write(2, 0b01);
writer.write(2, 0b1101);
writer.write(2, 0b1111101); // 0b01 will be written
```

## Serialization (Elements)

You can declaratively specify elements of bitstreams, then read and write them to bitstream readers/writers as needed. To do this, extend the `BitstreamElement` class:

```typescript
import { BitstreamElement, Field } from '@astronautlabs/bitstream';

class MyElement extends BitstreamElement {
    @Field(2) field1 : number;
    @Field(4) field2 : number;
    @Field(3) field3 : number;
    @Field(1) field4 : number;
    @Field(1) field5 : boolean;
}
```

If you specify type `boolean` for a field, the integer values `0` and `1` will be automatically converted to `false` and `true` respectively (and vice versa, when writing to a bitstream).

Then, deserialize using:

```typescript
let element = MyElement.deserializeSync(bitstreamReader);
```

Serialize using:

```typescript
element.serializeTo(bitstreamReader);
```

### Options

You can also specify some options for a field:

```typescript
@Field(3, { /* ... options here ... */ })
```

The available options are:
```typescript
export interface FieldOptions {
    deserializer? : (value : number) => any;
    group? : string;
}
```

- **deserializer** - A function which will be used to transform the raw numeric value from the 
  bitstream into a value that will be stored in the element object during deserialization
- **group** - A string group name that can be used with `deserializeGroup()` to enable dynamic formats

## Advanced Serialization

If you need to dynamically omit or include some fields, or otherwise implement custom serialization,
you can override the `deserializeFrom()` and `serializeTo()` methods in your subclass. This allows you
to control exactly how fields are populated. You can call `deserializeGroup(bitstreamReader, '*')` to 
immediately deserialize all fields, or `deserializeGroup(bitstreamReader, 'groupName')` to deserialize
fields which are in the group named `groupName`.

You may also require additional information to be available to your deserialization/serialization 
routines. For instance:

```
export class FirstElement extends BitstreamElement  {
    @Field(2) foo : number;
}

export class SecondElement extends BitstreamElement {
    deserializeFrom(bitstreamReader : BitstreamReader, firstElement : BitstreamElement) {

    }
}

let firstElement = FirstElement.deserializeSync(bitstreamReader);
let secondElement = new SecondElement();
secondElement.deserializeFrom(bitstreamReader, firstElement);
```

Here, we are passing a previously decoded element into the `deserializeFrom()` of the element being 
deserialized. You could pass any arbitrary data in this fashion, giving you flexibility in how you 
handle advanced serialization.