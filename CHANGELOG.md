# v1.1.0

- Adds support for retaining buffers in BitstreamReader as well as "seeking" to a previous buffer if it has been retained. 
  This can be useful for implementing a "try read" pattern which resets the read head back to the correct position if there
  are not enough bits available to complete the operation. See `BitstreamReader#retainBuffers` and `BitstreamReader#offset` 
  for details