/* istanbul ignore file */
import "source-map-support/register";

import { FPSCounter, Generator, runTests } from './benchmark-utils';
import { BitstreamReader } from './bitstream';

runTests([
    { 
        name: 'byteAlignedReads-8bit', 
        unit: 'bytes', suffix: '/s',
        func() {
            let bitstream = new BitstreamReader();
            let data = Buffer.alloc(500 * 1024 * 1024, 123);
            bitstream.addBuffer(data);
        
            let read = 0;
            let max = data.length;
            let start = Date.now();
        
            for (; read < max; ++read)
                bitstream.readSync(8);
            let time = Date.now() - start;
            return read / (time / 1000);
        }
    },
    { 
        name: 'byteAlignedReads-16bit', 
        unit: 'bytes', suffix: '/s',
        func() {
            let bitstream = new BitstreamReader();
            let data = Buffer.alloc(25 * 1024 * 1024, 123);
            bitstream.addBuffer(data);
        
            let read = 0;
            let max = data.length / 2;
            let start = Date.now();
        
            for (; read < max; ++read) {
                bitstream.readSync(16);
            }

            let time = Date.now() - start;
            return read / (time / 1000);
        }
    },
    { 
        name: 'byteAlignedReads-24bit', 
        unit: 'bytes', suffix: '/s',
        func() {
            let bitstream = new BitstreamReader();
            let data = Buffer.alloc(25 * 1024 * 1024, 123);
            bitstream.addBuffer(data);
        
            let read = 0;
            let max = data.length / 3 | 0;
            let start = Date.now();
        
            for (; read < max; ++read) {
                bitstream.readSync(24);
            }

            let time = Date.now() - start;
            return read / (time / 1000);
        }
    },
    { 
        name: 'byteAlignedReads-32bit', 
        unit: 'bytes', suffix: '/s',
        func() {
            let bitstream = new BitstreamReader();
            let data = Buffer.alloc(200 * 1024 * 1024, 123);
            bitstream.addBuffer(data);
        
            let read = 0;
            let max = data.length / 4;
            let start = Date.now();
        
            for (; read < max; ++read) {
                bitstream.readSync(32);
            }

            let time = Date.now() - start;
            return read / (time / 1000);
        }
    },
    { 
        name: 'byteOffsetReads-8bit', 
        unit: 'bytes', suffix: '/s',
        func() {
            let bitstream = new BitstreamReader();
            let data = Buffer.alloc(25 * 1024 * 1024 + 2, 123);
            bitstream.addBuffer(data);
            bitstream.read(4);

            let read = 0;
            let max = data.length - 1;
            let start = Date.now();
        
            for (; read < max; ++read)
                bitstream.readSync(8);
            let time = Date.now() - start;
            return read / (time / 1000);
        }
    },
    {
        name: 'halfByteReads',
        unit: 'bytes', suffix: '/s',
        func() {
            let bitstream = new BitstreamReader();
            let data = Buffer.alloc(25 * 1024 * 1024, 123);
            bitstream.addBuffer(data);
        
            let read = 0;
            let max = data.length * 2;
            let start = Date.now();
        
            for (; read < max; ++read)
                bitstream.readSync(4);
            let time = Date.now() - start;
            return read / (time / 1000);
        }
    }
]);

async function asyncTest() {
    let generator = new Generator();
    let bitstream = new BitstreamReader();
    let counter = new FPSCounter('hits');

    counter.start(5*1000);
    generator.on('data', data => {
        bitstream.addBuffer(data);
        console.log(`backlog: ${bitstream.available} bits now enqueued`);
    });

    setInterval(() => {
        console.log(`backlog: ${bitstream.available} bits not yet read`);
    }, 5*1000);

    while (true) {
        let byte = await bitstream.read(8);
        counter.hit();
    }
}
