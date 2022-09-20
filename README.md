# @/bitstream 

[![npm](https://img.shields.io/npm/v/@astronautlabs/bitstream)](https://npmjs.com/package/@astronautlabs/bitstream)
[![CircleCI](https://circleci.com/gh/astronautlabs/bitstream.svg?style=svg)](https://circleci.com/gh/astronautlabs/bitstream)

- **Isomorphic**: Works in Node.js and in the browser
- **Zero-dependency**: No runtime dependencies
- **Battle-hardened**: Used to implement media standards at Astronaut Labs
- **Comprehensive testing**: [90.38% coverage](https://218-305936359-gh.circle-artifacts.com/0/coverage/lcov-report/index.html) and growing!
- **Performant**: Elements use generators (not promises) internally to maximize performance
- **Flexible**: Supports both imperative and declarative styles
- **Modern**: Ships as ES modules (with CommonJS fallback)

Highly performant Typescript library for reading and writing to "bitstreams": tightly packed binary streams containing 
fields of varying lengths of bits. This package lets you treat a series of bytes as a series of bits without needing to 
manage which bytes the desired bit-fields fall within. Bitstreams are most useful when implementing network protocols 
and data formats (both encoders and decoders).

# Motivation

[Astronaut Labs](https://astronautlabs.com) is building a next-generation broadcast technology stack centered around 
Node.js and Typescript. That requires implementing a large number of binary specifications. We needed a way to do 
this at scale while ensuring accuracy, quality and comprehensiveness. We also see value in making our libraries open 
source so they can serve as approachable reference implementations for other implementors and increase competition in 
our industry. The best way to do that is to be extremely comprehensive in the way we build these libraries.
Other implementations tend to skip "irrelevant" details or take shortcuts, we strive to avoid this to produce the most 
complete libraries possible, even if we don't need every detail for our immediate needs.

# Installation

`npm install @astronautlabs/bitstream`

# Libraries using Bitstream

The following libraries are using Bitstream. They are great examples of what you can do with it! If you would like your
library to be listed here, please send a pull request!

- https://github.com/astronautlabs/st2010
- https://github.com/astronautlabs/st291
- https://github.com/astronautlabs/scte35
- https://github.com/astronautlabs/scte104
- https://github.com/astronautlabs/rfc8331

# BitstreamReader: Reading from bitstreams imperatively

```typescript
import { BitstreamReader } from '@astronautlabs/bitstream';

let reader = new BitstreamReader();

reader.addBuffer(Buffer.from([0b11110000, 0b10001111]));

await reader.read(2); // == 0b11
await reader.read(3); // == 0b110
await reader.read(4); // == 0b0001
await reader.read(7); // == 0b0001111
```

The above will read the values as unsigned integers in big-endian (network byte order) format.

## Asynchronous versus Synchronous

All read operations come in two flavors, asynchronous and synchronous. For instance to read an unsigned integer 
asynchronously, use `read()`. For this and other asynchronous read operations, resolution of the resulting promise 
is delayed until enough data is available to complete the operation. Note that there can be only one asynchronous 
read operation in progress at a time for a given BitstreamReader object.

The synchronous method for reading unsigned integers is `readSync()`. When using synchronous methods, there must be 
enough bytes available to the reader (via `addBuffer()`) to read the desired number of bits. If this is not the case, 
an exception is thrown. You can check how many bits are available using the `isAvailable()` method:

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

## Reading signed integers

Use the `readSigned` / `readSignedSync` methods to read a signed two's complement integer.

## Reading floating-point integers [IEEE 754]

Use the `readFloat` / `readFloatSync` methods to read an IEEE 754 floating point value. The bit length passed must be 
either 32 (32-bit single-precision) or 64 (64-bit double-precision).

## Reading Strings

Use the `readString` / `readStringSync` methods to read string values.

```typescript
await reader.readString(10); // read a fixed length string with 10 characters.
```

By default `readString()` will cut off the string at the first character with value `0` (ie, the string is 
considered null-terminated) and stop reading. You can disable this behavior so that the returned string always 
contains all bytes that were in the bitstream:

```typescript
await reader.readString(10, { nullTerminated: false });
```

The default text encoding is UTF-8 (`utf-8`). You can read a string using any text encoding supported by the platform 
you are on. For Node.js these are the encodings supported by `Buffer`. On the web, only `utf-8` is available 
(see documentation for `TextEncoder`/`TextDecoder`).

```typescript
await reader.readString(10, { encoding: 'utf16le' })
```

> **Important**: In cases like above where you are using encodings where a character spans 
> multiple bytes (including UTF-8), the length given to `readString()` is always the _number of 
> bytes_ not the _number of characters_. It is easy to make mistaken assumptions in this regard.

# BitstreamWriter: Writing to bitstreams imperatively

```typescript
import { BitstreamWriter } from '@astronautlabs/bitstream';

let writer = new BitstreamWriter(writableStream, bufferLength);

writer.write(2, 0b10);
writer.write(10, 0b1010101010);
writer.write(length, value);
```

`writableStream` can be any object which has a `write(chunk : Uint8Array)` method (see exported `Writable` interface). 

Examples of writables you can use include:
- Node.js' writable streams (`Writable` from the `stream` package)
- `WritableStreamDefaultWriter` from the WHATWG Streams specification in the browser
- Any custom object which implements the `Writable` interface

The `bufferLength` parameter determines how many bytes will be buffered before the buffer will be flushed out to the 
passed writable stream. This parameter is optional, the default (and minimum value) is `1` (one byte per buffer).

# Writing unsigned integers

```typescript
writer.write(2, 0b01);
writer.write(2, 0b1101);
writer.write(2, 0b1111101); // 0b01 will be written
```

> **Note**: Any bits in `value` above the `length`'th bit will be ignored, so all of the above are equivalent.

# Writing signed integers 

Use the `writeSigned()` method to write signed two's complement integers.

# Writing floating point values 

Use the `writeFloat()` method to write IEEE 754 floating point values. Only lengths of 32 (for 32-bit single-precision)
and 64 (for 64-bit double-precision) are supported.

# Writing strings

Use the `writeString()` method to write string values. The default encoding is UTF-8 (`utf-8`). 
Any other encoding supported by the platform can be used (ie those supported by `Buffer` on Node.js). On the web, only `utf-8` is supported (see `TextEncoder` / `TextDecoder`).

# Writing byte arrays

Use the `writeBuffer()` method to write byte arrays. On Node.js you can also pass `Buffer`.

# BitstreamElement: declarative structural serialization

Efficient structural (de)serialization can be achieved by building subclasses of the `BitstreamElement` class.

## Deserialization (reading)

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

### Number fields

- `null` and `undefined` are written as `0` during serialization
- Numbers are treated as big-endian unsigned integers by default. Decimal portions of numbers are truncated. 
    - Use the `{ number: { format: 'signed' }}` option to use signed two's complement integer. Decimals are truncated
    - Use the `{ number: { format: 'float' }}` option to use IEEE 754 floating point. Decimals are retained
- An error is thrown when trying to serialize `NaN` or infinite values (except when using the `float` format)

### Boolean fields

If you specify type `boolean` for a field, the integer value `0` will be deserialized to `false` and all other values 
will be deserialized as `true`. When booleans are serialized, `0` is used for `false` and `1` is used for true.

You can customize this behavior using the boolean field options (ie `@Field(8, { boolean: { ... } })`):

- `true`: The numeric value to use for `true` (default `1`)
- `false`: The numeric value to use for `false` (default `0`)
- `undefined`: The numeric value to use when writing `undefined` (default `0`)
- `mode`: How to handle novel inputs when reading:
    - `"true-unless"`: The value is true unless the numeric value chosen for 'false' is observed (default mode). For 
       example `0` is `false`, `1` is `true`, `100` is `true`
    - `"false-unless"`: The value is false unless the numeric value chosen for 'true' is observed. For example
       `0` is `false`, `1` is `true`, `100` is `false`
    - `"undefined"`: The value is `true` if the numeric value for 'true' is observed, `false` if the numeric value for 
      'false' is observed and `undefined` otherwise. For example `0` is `false`, `1` is `true`, `100` is `undefined`.

If none of these options fit your use case, you can write a custom `Serializer`.

### String fields

Elements can also handle serializing fixed-length strings. For example, to represent a fixed-length 5-byte string, 
set the length to `5` (note that this differs from other types where the length is specified in bits).

> **Note:** Null-termination is the default here, make sure to set `nullTerminated` to `false` if you do not desire
> that behavior.

```typescript
    @Field(5) stringField : string;
```

If you wish to control the encoding options, use the `string` options group:

```typescript
    @Field(5, { string: { encoding: 'ascii', nullTerminated: false } }) 
    stringField : string;
```

For information about the available encodings, see "Reading Strings" above.

### Byte array fields (Buffers)

You can represent a number of bytes as a byte array:

```typescript
    @Field(10*8) read10BytesIntoBuffer : Uint8Array;
```

When running on Node.js you can also specify `Buffer` as the type instead:

```typescript
    @Field(10*8) read10BytesIntoBuffer : Buffer;
```

### Nested elements

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

### Arrays

Many kinds of arrays are supported.

#### Array with number values (unsigned/signed/float)

Arrays with number elements are natively supported for convenience. 

For example, to read 10 8-bit unsigned integers:

```typescript
class BufferElement extends BitstreamElement {
    @Field(10, { array: { type: Number, elementLength: 8 }})
    array : number[];
}
```

> **Important:** 
> - You must specify the `array.type` option when using elements. 
>   Typescript cannot convey the element type via reflection, only that the field is of type `Array`
>   which is not enough information to deserialize the array.
> - When using arrays of numbers you must specify the `array.elementLength` option for the library to know how many 
>   bits each array item represents within the bitstream. For other array item types such as BitstreamElement
>   the length is already known and `array.elementLength` is ignored

You can read signed integers and floating point values instead of unsigned integers by specifying the `number.format` 
option (see Number Fields for more information).

When handling arrays, the length parameter of `@Field()` is used to represent the item count for the array by default. Alternatively (and mainly for historical reasons) you can also set the `options.array.count` property.

#### Derived lengths

As with all fields, you can represent the number of items dynamically with a determinant fucntion, allowing the array 
length to be dependent on any value already read before the field being read. For more information about this, see the 
section on "Dynamic Lengths" below.

You can pair this with the `writtenValue` feature to ensure that the correct length is always written to the bitstream.

#### Array with preceding count

You can specify that a preceding count field should be read to determine what the length of the array is in the 
`countFieldLength` option. If this option is not provided or undefined, no preceding count field is read.

#### Array with element values

You can also use arrays of elements:

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

The above will expect an 8-bit "count" field (indicates how many items are in the array), followed by that number of 
`PartElement` syntax objects. Since `ItemElement` is 8 bits long, when the count is `3`, there will be `3` additional 
bytes (24 bits) following the count in the bitstream before the next element begins. 

#### Dynamic arrays

Some bitstream formats do not send information about the number of items prior to the items themselves. In such cases 
there is often a final "sentinel" value instead. This can be handled by using the `hasMore` discriminant:

For instance, consider the following set up where the array ends when a suffix field is false:

```typescript
class ItemElement extends BitstreamElement {
    @Field(8) value : number;
    @Field(8) hasMore : boolean;
}

class ListElement extends BitstreamElement {
    @Field(0, { array: { type: ItemElement, hasMore: a => a[a.length - 1].hasMore }})
    array : ItemElement[];
}
```

### Optional fields

You can make any field optional by using the `presentWhen` and/or `excludedWhen` options:

```typescript
class ItemElement extends BitstreamElement {
    @Field(3) a : number;
    @Field(5, { presentWhen: i => i.a === 10 }) b : number;
}
```

In the above case, the second field is only present when the first field is `10`.

`excludedWhen` is the opposite of `presentWhen` and is provided for convenience and expressiveness.

### Field Initializers

When using `@Field()` to present a child BitstreamElement relationship,
it can be useful to run some code to initialize the instance that is 
created.

```ts
class Parent {
    @Field(8)
    context: number;

    @Field({ initializer: (instance, parent) => instance.context = parent.context })
    child: Child;
}

class Child {
    context: number;
}
```

You can also use this from the static `read()` method:

```ts
Child.read(reader, { initializer: instance => instance.context = somePreviouslyParsedContextNumber });
```

This is a useful pattern for passing knowledge needed for parsing a child element down from unknown parent elements.

### Dynamic lengths

Sometimes the length of a field depends on what has been read before the field being read.  You can specify lengths as _determinant_ functions which determine lengths dynamically:

```typescript
class ItemElement extends BitstreamElement {
    @Field(3) length : number;
    @Field(i => i.length) value : number;
}
```

In the above, if `length` is read as `30`, then the `value` field is read/written as 30 bits long.
Determinants can make use of any property of the instance which appear in the bitstream before the current element. 
They are also passed the bitstream element which contains this one (if one exists).

Determinants are available on many other properties as well. Where booleans are expected _discriminants_ work the same 
way. Examples of features that accept discriminants include `hasMore`, `presentWhen` and discriminants are the core 
concept which enabling element variation (`@Variant()`).

### Variation

Many bitstream formats make use of the concept of specialization. BitstreamElement supports this using its variation
system. Any BitstreamElement class may have zero or more classes (which are marked with `@Variant()`) which are 
automatically substituted for the class which is being read provided the discriminant passed to `@Variant()` holds true.

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

When reading an instance of `BaseElement` the library automatically checks the discriminants specified on the defined 
Variant classes to determine the appropriate subclass to substitute. In the case above, if `type` is read as `0x2` when 
performing `await BaseElement.read(reader)`, then the result will be an instance of `Type2Element`.

> **Note:** Variation which occurs at _the end_ of a bitstream element (as above) is referred to as "tail variation". 
> Variation which occurs in _the middle_ of a bitstream element is referred to as "marked variation".

### Marked variation

Sometimes a bitstream format specifies that the specialized fields fall somewhere in the middle of the overall 
structure, with the fields of the base class falling both before and after those found in the subclass. This is called 
"marked variation".

`BitstreamElement` can accomodate this using `@VariantMarker()`:

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

In the above example, variation will occur after reading `type` but before reading `checksum`. After variation occurs 
(resulting in a `Type2Element` instance), the `checksum` field will then be read.

### Computing written values

Sometimes it is desirable to override the value present in a field with a specific formula. This is useful when 
representing the lengths of arrays,  Buffers, or ensuring that a certain hardcoded value is always written regardless 
of what is specified in the instance being written. Use the  `writtenValue` option to override the value that is 
specified on an instance:

```typescript
class Type2Element extends BaseElement {
    @Field(version, { writtenValue: () => 123 })
    version : number;
}
```

The above element will always write `123` in the field specified by `version`. 

You can depend on properties of the containing object as well. Unlike determinants used during reading, these functions
have full access to the value being serialized, so they can look ahead as well as behind for determining the value to
write.

```typescript
class Type2Element extends BaseElement {
    @Field(version, { writtenValue: i => i.items.length })
    count : number;

    @Field(i => i.count, { array: { type: Number, elementLength: 8 }})
    items : number[];
}
```

This sort of arrangement is useful for handling more complex array length scenarios, as `count` is able to be parsed 
and serialized independently from `items`, thus allowing `items` to reference `count` in it's determinant function.

Similarly, when writing the value to bitstream, the value found in `items` determines the value of `count`, ensuring 
that the two are always in sync _on the wire_. 

One downside of this approach is that callers interacting with the Type2Element instances must be aware that `count`
and `items` are not intrinsically linked (even if temporarily), and thus may not agree at all times.

A cleaner approach to handle this is to encapsulate this into the object and forbid writing to `count` outside of 
parsing:

```typescript
class Type2Element extends BaseElement {
    @Field(version, { writtenValue: i => i.items.length })
    private $count : number;

    get count() { return this.items?.length ?? this.$count; }

    @Field(i => i.$count, { array: { type: Number, elementLength: 8 }})
    private $items : number[];

    get items() { return this.items; }
    set items(value) { 
        this.$items = value ?? []; 
        this.$count = this.$items.length;
    }
}
```

Here `count` and `items.length` will always agree at all times, with the bonus that assigning `undefined` to the array
is forbidden.

### Measurement

It can be useful to measure the bitlength of a portion of a BitstreamElement. Such a measurement could be used when 
defining the length of a bit field or when defining the value of a bitfield. Use the `measure()` method to accomplish 
this.

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

Measurement is extremely useful, but because `measure()` only measures fields _inclusively_ it is tempting to introduce 
fields with zero length which can be used as _markers_ for measurement purposes. You can absolutely do this with fields 
marked `@Field(0)`, but there is a dedicated decorator for this: `@Marker()`, which also marks the field as "ignored", 
meaning it will never actually be read or written from the relevant object instance.

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

### Measurement shortcuts

There is also `measureTo()` and `measureFrom()` which measure the entire element up to and including a specific field, and from a specific field to the end of an element, respectively. You can also use `measureField()` to measure the size of a specific field.

### Type-safe field references

Note that in prior examples we specified field references as strings when calling `measure()`. You can also specify field references as functions which allow for better type safety:

```typescript
class Type2Element extends BaseElement {
    @Field(version, { writtenValue: () => 123 })
    version : number;

    @Field(8, { writtenValue: (i : Type2Element) => i.measureFrom(i => i.$lengthStart) })
    length : number;

    @Marker() $lengthStart;
    @VariantMarker() $variant;
}
```

In the case above the type of the determinant is carried through into the `measureFrom()` call, and Typescript will 
alert you if you reference a field that doesn't exist on `Type2Element`.

### Reserved fields

There is also `@Reserved(length)` which can be used in place of `@Field(length)`. This decorator marks a field as 
taking up space in the bitstream, but ignores the value in the object instance when reading/writing. Instead the value 
is always high bits. That is, a field marked with `@Reserved(8)` will always be written as `0xFF` (`0b11111111`). This 
can be useful for standards which specify that reserved space should be filled with high bits. `@ReservedLow()` is also 
provided which will do the opposite- filling the covered bits with all zeroes. 

Other schemes can be accomodated with custom decorators. For instance:

```typescript
function RandomReserved(length : LengthDeterminant) {
    return Field(length, { ignored: true, writtenValue: () => Math.floor(Math.random() * 2**length) });
}
```

The above function can be used as a decorator to specify that the values read/written should be ignored (and not read/
written to the object), and when writing the value to a bitstream it should be populated with a random value. It could 
be used like so:

```typescript
class MyElement extends BitstreamElement {
    @RandomReserved() reserved : number;
}
```

## Writing elements to bitstreams

Write to a BitstreamWriter with:

```typescript
element.write(bitstreamWriter);
```

Serialize to a Buffer using:

```typescript
let buffer = element.serialize();
```

## Custom Serializers 

`BitstreamElement` can be extended to support arbitrary field types by implementing new serializers. Simply 
implement the `Serializer` interface and use the `serializer` option on the `@Field()` properties you wish to use it 
with.

## Advanced element serialization

If you need to dynamically omit or include some fields, or otherwise implement custom serialization,
you can override the `deserializeFrom()` and `serializeTo()` methods in your subclass. This allows you
to control exactly how fields are populated. You can call `deserializeGroup(bitstreamReader, '*')` to 
immediately deserialize all fields, or `deserializeGroup(bitstreamReader, 'groupName')` to deserialize
fields which are in the group named `groupName`.

You may also require additional information to be available to your deserialization/serialization 
routines. For instance:

```typescript
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

Here, we are passing a previously decoded element into the `deserializeFrom()` of the element being deserialized. You 
could pass any arbitrary data in this fashion, giving you flexibility in how you handle advanced serialization.

### Allowing Exhaustion

When using `BitstreamElement#deserialize()` to parse an element object from a byte array / buffer, you can use 
`allowExhaustion` to suppress the exception when the available bits are exhausted and instead return the partially read
object. This can be very useful for diagnostics or for cases where there are optional tailing fields.

# Architecture

## Generators 

The elements system uses generators internally in a coroutine-like fashion for allowing parsing to work asynchronously 
while still taking little or no performance penalty when using the parser in a synchronous manner. When the bitstream 
becomes exhausted during reading, the reader yields the number of bits it needs. The caller is then responsible 
for waiting until that amount of bits is available, and then resuming the generator where it left off. The caller uses
`BitstreamReader.assure()` to accomplish this. 

For this reason, many lower level read operations return `Generator` instead of the final value or the `Promise`. In
a fully synchronous setting (such as `deserialize` or an already assured read), the caller will use the generator to
get a single (and final) value back which will be the value that was read. 

Using generators internally provides a massive performance boost over doing the same with Promises as the original 
version of this library did. See below for an analysis of the relevant performance aspects.

# Performance

When reading data from BitstreamReader, you have two options: use the synchronous methods which will throw if not 
enough data is available, or the asynchronous methods which will wait for the data to arrive before completing the read 
operation. If you know you have enough data to complete the operation, you can read synchronously to avoid the overhead 
of creating and awaiting a Promise. If your application is less performance intensive you can instead receive a Promise 
for when the data becomes available (which happens by a `addBuffer()` call). This allows you to create a 
pseudo-blocking control flow similar to what is done in lower level languages like C/C++. However using promises in 
this manner can cause a huge reduction in performance while reading data. You should only use the async API when 
performance requirements are relaxed. 

When reading data into a **declarative BitstreamElement** class however, ECMAscript generators are used to control 
whether the library needs to wait for more data. When reading a BitstreamElement using the Promise-based API you are 
only incurring the overhead of the Promise API once for the initial call, and once each time there is not enough data 
available in the underlying BitstreamReader, which will only happen if the raw data is not arriving fast enough. In 
that case, though the Promise will have the typical overhead, it will not impact throughput because the IO wait time 
will be larger than the time necessary to handle the Promise overhead. We believe that this effectively eliminates the 
overhead of using an async/await pattern with reasonably sized BitstreamElements, so we encourage you start there and 
optimize only if you run into throughput / CPU / memory bottlenecks.

With generators at the core of BitstreamElement, implementing high throughput applications such as audio and video 
processing are quite viable with this library. You are more likely to run into a bottleneck with Javascript or Node.js 
itself than to be bottlenecked by using declarative BitstreamElement classes, of course your mileage may vary! If you 
believe BitstreamElement is a performance bottleneck for you, please file an issue!

## So is it faster to "hand roll" using BitstreamReader instead of using BitstreamElements?

Absolutely not. You should use BitstreamElement whereever possible, because it is using generators as the core 
mechanism for handling bitstream exhaustion events. Using generators internally instead of promises is _dramatically_ 
faster. To see this, compare the performance of @astronautlabs/bitstream@1 with @astronautlabs/bitstream@2. Using 
generators in the core was introduced in v2.0.0, prior to that a Promise was issued for every individual read call.

How many times can each version of the library read the following BitstreamElement structure within a specified period 
of time?

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

While we're proud of the performance improvement, it really just shows the overhead of Promises and how that 
architecture was the wrong choice for BitstreamElements in V1. 

Similarly, we tried giving a 1GB buffer to each version with the above test -- V2 was able to parse the entire buffer 
in less than a millisecond, whereas V1 effectively _did not complete_ -- it takes _minutes_ to parse such a Buffer with 
V1 even once, and quite frankly we gave up waiting for it to complete.

# Debugging Element Serialization

It can be tricky to know where your app gets stuck reading a Bitstream Element. If you set 
`globalThis.BITSTREAM_TRACE = true` then Bitstream will begin outputting some trace messages to help you understand 
what field your app got stuck on while reading. This can be very helpful when your protocol descriptions have too many 
bits.

# Contributing

We encourage you to file issues and send pull requests! Please be sure to follow the 
[Code of Conduct](CODE_OF_CONDUCT.md).

## Tests

Use `npm test` to run the test suite after making changes. Code coverage will also be generated. **Important:** Istanbul (the code coverage tool we are using) instruments the code to perform its coverage analysis. This breaks line numbers in stack traces. Use `npm test:nocov` to skip Code Coverage generation to obtain correct line numbers during testing.