# ⏩ vNext

# v4.2.2
- Fix an issue where the new 53-bit oversize error is emitted when the `float` format is selected, even though it is 
  valid and safe to use size `64` for a float.

# v4.2.1
- Add inference based type safety in more places. 
- It is no longer necessary to specify a length determinant if the length is inferred (such as when declaring
  a field of type BitstreamElement)

# v4.2.0

- Type safety has been dramatically increased thanks to new inference available for decorators in Typescript 5.
  Note that this library does not use the new ES decorator standard as it relies on Typescript's 
  `--emitDecoratorMetadata` functionality which has no equivalent yet when using standardized decorators.
  If you are using Typescript 4 you may experience issues around discriminators in fields and variants as the 
  types of element values gets upgraded to `BitstreamElement` from `any`, but not all the way to the specific 
  subclass you are applying the decorator to as it does in Typescript 5.
- The `BitstreamRequest` interface, which is used internally to track pending reads, is no longer exported. This 
  interface previously had no use for consumers of the library and was exported accidentally, so this is not 
  considered a breaking change.
- `BitstreamReader` now supports the concept of ending the stream using `end()`. When a reader ends, a blocking read is 
  rejected.  
- `BitstreamReader.assure()` now rejects if the stream ends before the requested number of bits is satisfied. Previously,
  since there was no way to end a stream, it would remain unresolved forever, until a buffer satisfied it. Pass 
  `true` as the `optional` parameter to have the returned promise resolve even if not all bits could be read. You can 
  pair this with reading `available` directly to check if all requested bits have been read.
- `BitstreamReader.addBuffer()` throws if called on an ended reader
- `BitstreamReader.reset()` has been added to reset a reader to a clean state, including causing the reader's ended 
  flag to get reset.
- `BitstreamReader.simulate()` and `BitstreamReader.simulateSync()` have been added to provide a convenient way to 
  run a function and reset the read head of the reader back to where it was before the function was called. This is 
  equivalent to enabling the `retainBuffers` setting, noting the offset before executing the function, and setting 
  the offset back to where it was before the simulation.
- Added read ahead capability to `BitstreamElement`. See the `readAhead` field options for more information. 
- Made discriminant types more specific. Previously a single `Discriminant` type was used for both variant discriminants 
  and field presence discriminants, but the `parent` parameter was never passed to field presence discriminants. Now 
  these are represented with their own distinct types (`VariantDiscriminant` and `FieldPresenceDiscriminant` 
  respectively).

# v4.1.3
- Performance: Substantial optimizations around byte-aligned reads, partial byte-aligned reads, byte array reads, and
  other scenarios. In some scenarios, performance can be 10x faster, and in the case of reading byte-aligned byte arrays, 
  the improvement is somewhere in the realm of 500x faster. This is a common scenario in data-heavy parsers such as 
  audio/video formats.

# v4.1.2
- Performance: `serialize()` now uses a 1KB buffer by default, previously the default buffer size was 1 byte. This yields a 
  massive performance increase when writing large objects using `serialize()`
- Performance: `serialize()` will now recycle its `BitstreamWriter` objects in order to eliminate object allocations,
  providing an additional performance increase.

# v4.1.1
- Fix: Calling flush early resulted in writing entire buffer size instead
- Added fast path for BitstreamWriter#writeBytes() when the stream is byte-aligned

# v4.1.0
- Add support for initializers

# v4.0.1
- Guard when BufferSerializer is trying to write a null buffer

# v4.0.0
- Changed generators to return IncompleteReadResult to enable better context information during buffer exhaustion

# v3.1.1

- Fix: Crash during `serialize()` on element with no fields
- Fix: backwards-compat: Keep providing `SerializeOptions` for compatibility

# v3.1.0

- Add `allowExhaustion` option to `deserialize()`

# v3.0.4

- Add `BitstreamReader#readBytes*()` and `BitstreamWriter#writeBytes()` for reading/writing a number 
  of bytes into a buffer or typed array.
- Deprecated `BitstreamWriter#writeBuffer()` in favor of `writeBytes()`

# v3.0.3

- Add `WritableStream#offset` and `WritableStream#byteOffset`
- Eliminate use of `BitstreamElement#measure()` within `BitstreamElement#serialize()`. This produces more predictable
  behavior for lifecycle hooks, is more performant and ensures only one `write()` call is needed per `serialize()` 
  call

# v3.0.2

- Context is now shared between owner of array and array elements during write operations

# v3.0.1

- The current reader offset is now reported when the buffer becomes exhausted during deserialization
- Context is now set up correctly during write operations

# v3.0.0

Features:
- Ability to read/write IEEE 754 floating point and signed (two's complement) integers
- Added support for lifecycle operations on elements
- Elements and all nested sub-elements now have a shared "context" object for elements during (de)serialization
- Documentation improvements

Breaking changes:
- Removed the `BitstreamReader.unread()` method which has been deprecated since `v1.0.1` released March 28, 2021.
- The `BitstreamElement.read()` family of operations now accepts an options bag instead of positional parameters
- An exception will now be thrown when trying to serialize (+/-) `Infinity` to an integer number field (either signed 
  or unsigned)
- `BitstreamElement.deserialize()` no longer returns a Promise. The operation has not been asynchronous since the 
  generator rewrite in 2.0, so promises are not required here and unnecessarily complicate efficient deserialization.
- In previous versions the length parameter of `@Field()` was ignored by `ArraySerializer` even though it was documented
  as a valid way to specify the item count of the array. This version makes `ArraySerializer` respect this value when
  `options.array.count` is not specified. This matches the design intention, but since the default count was zero, this 
  is technically a breaking change since, for example, `@Field(3, { array: { elementSize: 8 }}) items : number[]` 
  previously would read zero numbers and now it will read three.
- hasMore() now accepts the `array` being built so that analyzing the values read prior can influence the result. The 
  `instance` and `parent` parameters are still present and follow the `array`.
  
# v2.1.1
- Fix: `@ReservedLow` should actually emit low bits 

# v2.1.0
- Add `@ReservedLow` decorator for cases where bits must be low instead of high (as in `@Reserved`)

# v2.0.4
- Fix: Do not crash when `Buffer` is unavailable

# v2.0.3
- Improved documentation, particularly performance guidance
- Eliminated dependency on `streambuffers`
- `Uint8Array` can now be used instead of `Buffer` to allow the library to be used on the web

# v2.0.2
- Fixed a bug where BitstreamElement.deserialize() would return a promise resolved with a generator instead of 
  the final element instance

# v2.0.1
- Much improved documentation

# v2.0.0

- Use generators instead of promises to implement blocking reads. This allows us to defer the strategy for handling 
  bitstream underruns to the top level including support for continuation (as generators are really just coroutines).
  The core `BitstreamElement.read()` method now returns a generator.
  Several new reading strategies built upon generators are provided, including `readSync()` (try to complete the 
  operation, and fail if there are not enough bits available), `tryRead()` (try to complete the operation, and return 
  undefined if not enough bits are available, undoing all pending reads from the bitstream), `readBlocking()` (read the 
  object and wait for bits to become available as necessary by awaiting `BitstreamReader.assure()`)

# v1.1.0

- Adds support for retaining buffers in BitstreamReader as well as "seeking" to a previous buffer if it has been retained. 
  This can be useful for implementing a "try read" pattern which resets the read head back to the correct position if there
  are not enough bits available to complete the operation. See `BitstreamReader#retainBuffers` and `BitstreamReader#offset` 
  for details