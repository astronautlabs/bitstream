# @/bitstream 

[![npm](https://img.shields.io/npm/v/@astronautlabs/bitstream)](https://npmjs.com/package/@astronautlabs/bitstream)
[![CircleCI](https://circleci.com/gh/astronautlabs/bitstream.svg?style=svg)](https://circleci.com/gh/astronautlabs/bitstream)

> **Alpha Quality**  
> This software is very new and unstable. Use with caution, and avoid use in 
> production without careful consideration. Major API changes may be made 
> frequently.

Typescript utility library for reading and writing to "bitstreams", that is, tightly packed binary streams containing 
fields of varying lengths of bits. This package lets you treat a series of bytes as a series of bits without needing to manage which bytes the desired fields fall within. Bitstreams are most useful when implementing network protocols and data formats (both encoders and decoders).

The goal of this library is to provide a very readable high level system for parsing and generating bitstreams. To
that end it includes both imperative and declarative mechanisms for doing so. 

# Performance

Most of the functionality of this library is used by awaiting promises. This allows you to create a pseudo-blocking 
control flow similar to what is done in lower level languages like C/C++. Using promises in this manner is very fast, 
and in most cases will not cause a performance bottleneck, but in certain extreme cases it will. We have a 
microbenchmark included which indicates that it can take upwards of 350,000 promises/sec before throughput is impacted.
This can be minimized, and when using the Elements features of this library, we take some measures to ensure we minimize
the amount of waits we use, to avoid hitting the threshold where throughput is negatively impacted, even on complex 
bitstream scenarios.

Regardless, for particularly taxing bitstreaming use cases such as compressed audio and video processing, the effect of 
promises on throughput should be considered. The library does offer synchronous read operations, and in many cases 
syntax parsing code can be restructured to reduce the effect. 

# Installation

`npm install @astronautlabs/bitstream`

# Reading bitstreams

```typescript
import { BitstreamReader } from '@astronautlabs/bitstream';

let reader = new BitstreamReader();

reader.addBuffer(Buffer.from([0b11110000, 0b10001111]));

await reader.read(2); // == 0b11
await reader.read(3); // == 0b110
await reader.read(4); // == 0b0001
await reader.read(7); // == 0b0001111
```

## Reading Strings

```typescript
await reader.readString(10); // read a fixed length string with 10 characters.
```

By default readString() will cut off the string at the first character with value `0` (ie, the string is 
considered null-terminated). You can disable this behavior so that the returned string always contains all bytes that 
were in the bitstream:

```typescript
await reader.readString(10, { nullTerminated: false });
```

By default the text is read as UTF-8. You can read a string using any text encoding supported by Node.js' Buffer class:

```typescript
await reader.readString(10, { encoding: 'utf16le' })
```

**Important**: In cases like above where you are using encodings where a character spans 
multiple bytes (including UTF-8), the length given to `readString()` is always the _number of 
bytes_ not the _number of characters_. This is an important distinction. You may inadvertently
make assumptions that the resulting string's `.length` is the same as the value passed to 
`.readString()` but this may not be true, even when you've set `nullTerminated: false`.

## Synchronous Reading

When using `read()` and other asynchronous read operations, resolution of the promise is automatically delayed until 
enough data is available to complete the operation.

When using `readSync()`, there must be enough bytes available to the reader (via `addBuffer()`) to read the desired 
number of bits. If this is not the case, `readSync()` throws an error. You can check how many bits are available using 
the `available()` method:

```typescript
if (reader.isAvailable(10)) {
    // 10 bits are available
    let value = reader.readSync(10);
}
```

Alternatively, you can use `.assure()` to wait until the desired number of bits are available. Again, there can only be 
one pending call to `read()` or `assure()` at a time. This allows you to "batch" synchronous reads in a single 
"await" operation.

```typescript
await reader.assure(13);
let value1 = reader.readSync(3);
let value2 = reader.readSync(10);
```

# Writing bitstreams



```typescript
import { BitstreamWriter } from '@astronautlabs/bitstream';

let writer = new BitstreamWriter(writableStream, bufferLength);

writer.write(2, 0b10);
writer.write(10, 0b1010101010);
writer.write(length, value);
```

`writableStream` is an object which has a `write(buffer)` method (such as a Node.js `Writable` from the `stream` builtin package).
The `bufferLength` parameter determines how many bytes will be buffered before the buffer will be flushed out to the 
passed writable stream. This parameter is optional, the default is `1` (one byte per buffer).

Note that any bits in `value` above the `length`'th bit will be ignored, so the following are all equivalent:

```typescript
writer.write(2, 0b01);
writer.write(2, 0b1101);
writer.write(2, 0b1111101); // 0b01 will be written
```

# Declarative (Elements)

## Deserialization (Reading)

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

Then, deserialize using:

```typescript
let element = await MyElement.deserialize(bitstreamReader);
```

If you specify type `boolean` for a field, the integer values `0` and `1` will be automatically converted to `false` and `true` respectively (and vice versa, when writing to a bitstream).

Elements can also handle serializing fixed-length strings. To represent a fixed-length 5 byte string, set the length to `5` (note that this differs from other field types, where the length
specified is in bits).

```typescript
    @Field(5) stringField : string;
```

If you wish to control the encoding options, use the `string` options group:

```typescript
    @Field(5, { string: { encoding: 'ascii', nullTerminated: false } }) 
    stringField : string;
```

You can represent a number of bytes as a Buffer:

```
    @Field(10*8) read10BytesIntoBuffer : Buffer;
```

You can also nest element classes:

```
class PartElement extends BitstreamElement {
    @Field(3) a : number;
    @Field(5) b : number;
}

class WholeElement extends BitstreamElement {
    @Field() part1 : PartElement;
    @Field() part2 : PartElement;
}
```

This is useful for organization, and is necessary when representing **arrays**:

```

class ItemElement extends BitstreamElement {
    @Field(3) a : number;
    @Field(5) b : number;
}

class ListElement extends BitstreamElement {
    @Field({ array: { type: PartElement, countFieldLength: 8 }}) 
    parts : PartElement[];
}
```

Note that you must specify the `array.type` option, as Typescript currently cannot 
convey the element type via reflection, only that the field is of type `Array`. 

In the underlying bitstream, the above will expect an 8-bit "count" field which indicates 
how many items are in the array, followed by that number of `PartElement` syntax objects.
So since `ItemElement` is 8 bits long, when the count is `3`, there will be `3` additional 
bytes (24 bits) following the count in the bitstream before the next element begins. 

Change `countFieldLength` to use a different bitfield size for the preceding count value.

## Serialization (writing)

Serialize using:

```typescript
element.serializeTo(bitstreamWriter);
```

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

Here, we are passing a previously decoded element into the `deserializeFrom()` of the element 
being deserialized. You could pass any arbitrary data in this fashion, giving you flexibility 
in how you handle advanced serialization.

# Contributing

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
This library is in heavy development. It is changing rapidly by the day. We highly recommend 
you open an issue to discuss the work you want to do before you start working, or risk 
inadvertently clashing with rapid changes being made to the codebase.