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