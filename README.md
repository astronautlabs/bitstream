# @/bitstream 

[![npm](https://img.shields.io/npm/v/@astronautlabs/bitstream)](https://npmjs.com/package/@astronautlabs/bitstream)
[![CircleCI](https://circleci.com/gh/astronautlabs/bitstream.svg?style=svg)](https://circleci.com/gh/astronautlabs/bitstream)

Highly performant Typescript library for reading and writing to "bitstreams", tightly packed binary streams containing fields of varying lengths of bits. This package lets you treat a series of bytes as a series of bits without needing to manage which bytes the desired fields fall within. Bitstreams are most useful when implementing network protocols and data formats (both encoders and decoders).

The goal of this library is to provide a very readable high level system for parsing and generating bitstreams. To
that end it includes both imperative and declarative mechanisms for doing so. 

# Installation

`npm install @astronautlabs/bitstream`

# Performance

When reading data from BitstreamReader, you have two options: use the synchronous methods which will throw if not enough data is available, or the asynchronous methods which will wait for the data to arrive before completing the read operation. If you know you have enough data to complete the operation, you can read synchronously to avoid the overhead of creating and awaiting a Promise. If your application is less performance intensive you can instead receive a Promise for when the data becomes available (which happens by a `addBuffer()` call). This allows you to create a pseudo-blocking control flow similar to what is done in lower level languages like C/C++. However using promises in this manner can cause a huge reduction in performance while reading data. You should only use the async API when performance requirements are relaxed. 

When reading data into a **declarative BitstreamElement** class however, ECMAscript generators are used to control whether the library needs to wait for more data. When reading a BitstreamElement using the Promise-based API you are only incurring the overhead of the Promise API once for the initial call, and once each time there is not enough data available in the underlying BitstreamReader, which will only happen if the raw data is not arriving fast enough. In that case, though the Promise will have the typical overhead, it will not impact throughput because the IO wait time will be larger than the time necessary to handle the Promise overhead. We believe that this effectively eliminates the overhead of using an async/await pattern with reasonably sized BitstreamElements, so we encourage you start there and optimize only if you run into throughput / CPU / memory bottlenecks.

With generators at the core of BitstreamElement, implementing high throughput applications such as audio and video processing are quite viable with this library. You are more likely to run into a bottleneck with Javascript or Node.js itself than to be bottlenecked by using declarative BitstreamElement classes, of course your mileage may vary! If you believe BitstreamElement is a performance bottleneck for you, please file an issue!

## So is it faster to "hand roll" using BitstreamReader instead of using BitstreamElements?

Absolutely not. You should use BitstreamElement whereever possible, because it is using generators as the core mechanism for handling bitstream exhaustion events. Using generators internally instead of promises is _dramatically_ faster. To see this, compare the performance of @astronautlabs/bitstream@1 with @astronautlabs/bitstream@2. Using generators in the core was introduced in v2.0.0, prior to that a Promise was issued for every individual read call.

How many times can each version of the library read the following BitstreamElement structure within a specified period of time?

```typescript
class SampleItem extends BitstreamElement {
    @Field(1) b1 : number;
    @Field(1) b2 : number;
    @Field(1) b3 : number;
    @Field(1) b4 : number;
    @Field(1) b5 : number;
    @Field(1) b6 : number;
    @Field(1) b7 : number;
    @Field(1) b8 : number;
}

class SampleContainer extends BitstreamElement {
    @Field(0, { array: { type: SampleItem, countFieldLength: 32 }})
    items : SampleItem[];
}
```

The results are night and day:
> **Iteration count while parsing a 103-byte buffer in 500ms** (_Intel Core i7 6700_)
> - @astronautlabs/bitstream@1.1.0: Read the buffer 104 times
> - @astronautlabs/bitstream@2.0.2: Read the buffer 1,163,576 times

While we're proud of the performance improvement, it really just shows the overhead of Promises and how that architecture was the wrong choice for BitstreamElements in V1. 

Similarly, we tried giving a 1GB buffer to each version with the above test -- V2 was able to parse the entire buffer in less than a millisecond, whereas V1 effectively _did not complete_ -- it takes _minutes_ to parse such a Buffer with V1 even once, and quite frankly we gave up waiting for it to complete.

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

Then, read from a BitstreamReader using:

```typescript
let element = await MyElement.read(bitstreamReader);
```

Or, deserialize from a Buffer using:

```typescript
let element = await MyElement.deserialize(buffer);
```

If you specify type `boolean` for a field, the integer values `0` and `1` will be automatically converted to `false` and `true` respectively (and vice versa, when writing to a bitstream).

### Strings

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

### Buffers

You can represent a number of bytes as a Buffer:

```
    @Field(10*8) read10BytesIntoBuffer : Buffer;
```

### Nested Elements

You can also nest element classes:

```typescript
class PartElement extends BitstreamElement {
    @Field(3) a : number;
    @Field(5) b : number;
}

class WholeElement extends BitstreamElement {
    @Field() part1 : PartElement;
    @Field() part2 : PartElement;
}
```

This is useful for organization, and is necessary when representing **arrays**.

### Arrays

Elements support arrays natively:

```typescript

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

### Optional Fields

You can make fields optional by using the `presentWhen` and/or `excludedWhen` options:

```typescript
class ItemElement extends BitstreamElement {
    @Field(3) a : number;
    @Field(5, { presentWhen: i => i.a == 10 }) b : number;
}
```

In the above case, the second field is only present when the first field is `10`.

`excludedWhen` is the opposite of `presentWhen` and is provided for convenience and expressiveness.

### Dynamic Lengths

Sometimes the length of a field depends on what has been read before the field being read. Whereever `BitstreamElement` lets you specify a length you can also provide a "determinant" function which determines the length instead of a literal number:

```typescript
class ItemElement extends BitstreamElement {
    @Field(3) length : number;
    @Field(i => i.length) value : number;
}
```

In the above, if `length` is read as `30`, then the `value` field is read/written as 30 bits long.

### Variants

Many bitstream formats have the concept of _specialization_. BitstreamElement represents this using the "Variant" system. Any BitstreamElement class may have zero or more "Variant" classes which are automatically substituted for the class which is being read.

```typescript
class BaseElement extends BitstreamElement {
    @Field(3) type : number;
}

@Variant(i => i.type === 0x1)
class Type1Element extends BaseElement {
    @Field(5) field1 : number;
}

@Variant(i => i.type === 0x2)
class Type2Element extends BaseElement {
    @Field(5) field1 : number;
}
```

When reading an instance of `BaseElement` the library automatically checks the _discriminants_ specified on the defined Variant classes to determine the appropriate subclass to substitute. In the case above, if `type` is read as `0x2` when performing `await BaseElement.read(reader)`, then the result will be an instance of `Type2Element`.

### Variation Sandwich

Sometimes a bitstream format specifies that the specialized fields fall somewhere in the middle of the overall structure, with the fields of the base class falling both before and after those found in the subclass. `BitstreamElement` can accomodate this using `@VariantMarker()`:

```typescript
class BaseElement extends BitstreamElement {
    @Field(3) type : number;
    @VariantMarker() $variant;
    @Field(8) checksum : number;
}

@Variant(i => i.type === 0x1)
class Type1Element extends BaseElement {
    @Field(5) field1 : number;
}

@Variant(i => i.type === 0x2)
class Type2Element extends BaseElement {
    @Field(5) field1 : number;
}
```

In the above example, variation will occur after reading `type` but before reading `checksum`. After variation occurs (resulting in a `Type2Element` instance), the `checksum` field will then be read.

### Written Values

Sometimes it is desirable to override the value present in a field with a specific formula. This is useful when representing the lengths of arrays,  Buffers, or ensuring that a certain hardcoded value is always written regardless of what is specified in the instance being written. Use the  `writtenValue` option to override the value that is specified on an instance:

```typescript
class Type2Element extends BaseElement {
    @Field(version, { writtenValue: () => 123 })
    version : number;
}
```

The above element will always write `123` in the field specified by `version`.

### Measurement

It can be useful to measure the bitlength of a portion of a BitstreamElement. Such a measurement could be used when defining the length of a bit field or when defining the value of a bitfield. Use the `measure()` method to accomplish this.

```typescript
class Type2Element extends BaseElement {
    @Field(8, { writtenValue: i => i.measure('version', 'checksum') })
    length : number;

    @Field(version, { writtenValue: () => 123 })
    version : number;

    @VariantMarker() $variant;

    checksum : number;
}
```

In the above, the written value of `length` will be the number of bits occupied by the fields starting from `version` through `checksum` inclusive, including all fields specified by the variant of the element which is being written.

### Markers 

Measurement is extremely useful, but because `measure()` only measures fields _inclusively_ it is tempting to introduce fields with zero length which can be used as _markers_ for measurement purposes. You can absolutely do this with fields marked `@Field(0)`, but there is a dedicated decorator for this: `@Marker()`, which also marks the field as "ignored", meaning it will never actually be read or written from the relevant object instance.

```typescript
class Type2Element extends BaseElement {
    @Field(version, { writtenValue: () => 123 })
    version : number;

    @Field(8, { writtenValue: i => i.measure('$lengthStart', '$lengthEnd') })
    length : number;

    @Marker() $lengthStart;

    @VariantMarker() $variant;

    @Marker() $lengthEnd;

    checksum : number;
}
```

In the above example, the written value of `length` will be the bit length of the fields provided by the variant subclass, not including any other fields. The fields `$lengthStart` and `$lengthEnd` will not contribute any data to the bitstream representation.

### Measurement Shortcuts

There is also `measureTo()` and `measureFrom()` which measure the entire element up to and including a specific field, and from a specific field to the end of an element, respectively. You can also use `measureField()` to measure the size of a specific field.

### Type-safe Field References

Note that in prior examples we specified field references as strings when calling `measure()`. You can also specify field references as functions which allow for better type safety:

```typescript
class Type2Element extends BaseElement {
    @Field(version, { writtenValue: () => 123 })
    version : number;

    @Field(8, { writtenValue: (i : Type2Element) => i.measureFrom(i => $lengthStart) })
    length : number;

    @Marker() $lengthStart;
    @VariantMarker() $variant;
}
```

In the case above the type of the determinant is carried through into the `measureFrom()` call, and Typescript will alert you if you reference a field that doesn't exist on `Type2Element`.

### Reserved fields

There is also `@Reserved(length)` which can be used in place of `@Field(length)`. This decorator marks a field as taking up space in the bitstream, but ignores the value in the object instance when reading/writing. Instead the value is always high bits. That is, a field marked with `@Reserved(8)` will always be written as `0xFF` (`0b11111111`). This can be useful for standards which specify that reserved space should be filled with high bits. Other schemes can be accomodated with custom decorators like this one:

```typescript
function LowReserved(length : LengthDeterminant) {
    return Field(length, { ignored: true, writtenValue: () => 0 });
}
```

The above function can be used as a decorator to specify that the values read/written should be ignored (and not read/written to the object), and that whenever writing the value it should be _low_ bits. It could be used like so:

```typescript
class MyElement extends BitstreamElement {
    @LowReserved() reserved : number;
}
```

## Serialization (writing)

Write to a BitstreamWriter with:

```typescript
element.write(bitstreamWriter);
```

Serialize to a Buffer using:

```typescript
let buffer = element.serialize();
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

# Debugging Element Serialization

It can be tricky to know where your app gets stuck reading a Bitstream Element. If you set `globalThis.BITSTREAM_TRACE = true`
then Bitstream will begin outputting some trace messages to help you understand what field your app got stuck on while 
reading. This can be very helpful when your protocol descriptions have too many bits.

# Contributing

We encourage you to file issues and send pull requests! Please be sure to follow the [Code of Conduct](CODE_OF_CONDUCT.md).